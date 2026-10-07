# Seedance 2.5 API — from $0.0874/s (480p)

**ByteDance Seedance 2.5 is live on [ArgoLink](https://argolink.io/gh-seedance-2-5-n8n-node)** at the prices below. This repository provides an n8n workflow for one video job per execution: submit once, preserve its request ID, wait between status checks, and download the finished MP4. It uses built-in nodes, so no community package installation is required. Despite the repository's historical name, this is a workflow export, not a published custom node package.

[Model page](https://argolink.io/gh-seedance-2-5-n8n-node) · [Price comparison](#price-comparison) · [Import and configure](#import-and-configure) · [FAQ](#faq)

Last checked: 2026-10-07.

## What the workflow contains

Import [workflows/seedance-2-5.json](workflows/seedance-2-5.json). The workflow is inactive on import and starts manually. Its sample prompt generates a five-second paper-boat shot with natural sound. Replace the prompt before running; executing the submit node creates a paid generation request.

| Stage | Node and version | Responsibility |
|---|---|---|
| Start | Manual Trigger 1 | Start exactly one item |
| Configure | Code 2 | Request body, API base, optional existing ID, poll limits |
| Resume existing? | IF 2.3 | Bypass POST when an existing ID is supplied |
| Submit once | HTTP Request 4.5 | POST `/videos/generations`; automatic retry disabled |
| Remember job | Code 2 | Carry request ID, deadline, and poll count forward |
| Wait before poll | Wait 1.1 | Delay without a tight request loop |
| Poll status | HTTP Request 4.5 | GET `/videos/{request_id}` with response headers |
| Inspect response | Code 2 | Interpret status and retry hints; enforce bounds |
| Done? / Pending? | IF 2.3 | Select download, another wait, or terminal failure |
| Download MP4 | HTTP Request 4.5 | GET `/content`; expose binary property `video` |
| Stop terminal job | Stop And Error 1 | Retain failed/expired status in execution history |

Versions and parameter names were checked against the current [n8n built-in node source](https://github.com/n8n-io/n8n/tree/master/packages/nodes-base/nodes). Header Auth is a generic credential, HTTP response options live under `options.response.response`, and binary downloads use `responseFormat: file`. Older installations may not understand these versions. Inspect a locally exported HTTP Request node before adapting the JSON; changing only a version number does not establish compatibility.

## Import and configure

1. Open a new workflow and use **Import from File** to select the JSON. See [n8n's export/import instructions](https://docs.n8n.io/workflows/export-import/).
2. Create a **Header Auth** credential named `Video API bearer`. Set header name `Authorization` and value `Bearer YOUR_API_KEY`. Obtain a key from the linked model page. Keep it in n8n's credential store, not a Code node or exported JSON.
3. Open **Submit once**, **Poll status**, and **Download MP4** and select that credential explicitly. Imported names are hints; this export contains neither a credential ID nor a token.
4. Open **Configure**. Leave `resume_request_id` empty for a new generation. Set prompt, duration, resolution, and aspect ratio. The base URL already includes `/v1`; do not append it twice.
5. Execute once. Copy the returned `request_id` from **Remember job** into your production notes. On success, download the binary `video` output from **Download MP4**.

Do not execute a downstream node without the preceding execution data. The polling Code node uses n8n item linking to recover job state from **Wait before poll**. This workflow deliberately handles one item at a time; a batch trigger would require separate per-item deadlines and request IDs.

## Request settings

| Setting | Verified model constraint |
|---|---|
| Model ID | `seedance-2.5` |
| Duration | 4–30 seconds; choose an explicit integer in this example |
| Resolution | `480p`, `720p`, `1080p` |
| Text/reference aspect ratios | `16:9`, `9:16`, `1:1`, `4:3`, `3:4`, `21:9`, `adaptive` |
| First/last frame mode | `frame_images`; use `adaptive` |
| Reference mode | `input_references`; up to 30 images, 10 videos, 10 audio files, 50 total |
| Prompt | Maximum 40,000 UTF-8 bytes |
| Audio | `generate_audio`; enabled in the sample |

The default is text-to-video. Replace `request` with a body validated against the model page for frame or reference inputs. Do not combine `frame_images` and `input_references`. For edits, use the edit contract rather than retaining text-to-video duration and ratio fields. Reference-video duration affects billing. This export is not a local-file uploader: provide accessible media URLs, or obtain a media URL using the documented upload flow first.

## Retry, timeout, and recovery

Normal polling waits ten seconds, with a one-hour deadline and a maximum of 240 status checks. These are client limits, not a promise about generation time. `pending` loops through Wait; `done` downloads; `failed` and `expired` stop with an error. Unknown statuses stop instead of silently polling forever.

Only status reads receive retry handling. HTTP 429 and 503 honor `Retry-After` as seconds or an HTTP date; without a usable hint, the configured interval applies. A hint beyond the deadline stops execution. Other HTTP failures, transport errors, and authentication problems remain visible for diagnosis. Download errors never create another video.

To recover, set `resume_request_id` to the recorded ID and execute again. This bypasses **Submit once** and grants a fresh polling budget. If POST timed out before an ID was recorded, inspect the provider's job history before resubmitting. Neither this workflow nor n8n can infer whether an ambiguous POST was accepted. Do not retry from the beginning in that situation.

Failed, rejected, and expired jobs are not charged by the documented contract. A local timeout does not cancel a server job or imply a refund. Early downloads return 409 `job_video_not_ready`; failed jobs return 424 `job_failed` at the content endpoint.

## Price comparison

USD per second, checked 2026-10-07. This table compares text/image generation without input video; billing is not identical across providers.

| Provider and primary source | 480p | 720p | 1080p |
|---|---:|---:|---:|
| [ArgoLink model page](https://argolink.io/en/models/seedance-2.5) | $0.0874 | $0.196 | $0.483 |
| [BytePlus official pricing](https://docs.byteplus.com/en/docs/modelark/model-pricing) | Unverified | Unverified | Unverified |
| [fal pricing](https://fal.ai/models/bytedance/seedance-2.5/text-to-video) | ~$0.2205 | ~$0.473 | ~$1.164 |
| [EvoLink pricing](https://evolink.ai/seedance-2-5) | $0.138 | $0.296 | $0.739 |

The official page did not expose a verifiable model row in this retrieval; its numeric prices are intentionally omitted. The sample five-second 720p output estimates **5 × $0.196 = $0.98**, excluding separately purchased source assets. Ten independent successful executions estimate $9.80. Poll counts are not generated seconds.

Reference video changes the comparison: the default service bills output seconds plus the floored sum of reference-video seconds at its ordinary resolution rate. EvoLink publishes lower reference-video rates but also applies a minimum billable input duration equal to output duration. fal publishes token billing and approximate per-second equivalents. Use each provider's formula before comparing edits or extensions. ArgoLink is not the cheapest option in every reference-video scenario.

## Equivalent command-line flows

[examples/run_video.py](examples/run_video.py) and [examples/run_video.sh](examples/run_video.sh) each submit, poll, and download. Both accept an existing ID and neither retries POST automatically.

```bash
export SEEDANCE_API_KEY='your-key'
python3 examples/run_video.py --output boat.mp4
bash examples/run_video.sh boat.mp4
# Or resume a known job without another submission:
python3 examples/run_video.py --resume job_ID --output boat.mp4
bash examples/run_video.sh boat.mp4 job_ID
```

Choose one implementation: running both new-job commands generates two videos. Shell requires curl and jq; Python uses its standard library. These diagnostic examples leave HTTP failures visible and stop after their polling budget; they do not implement the workflow's richer Retry-After handling.

## FAQ

**Is this an npm package?** No. Import the JSON; every node ships with n8n. The historical repository name is retained for existing links.

**Why is my credential missing after import?** Credentials belong to your instance. Select your locally created Header Auth credential in all three HTTP nodes.

**Can I restart after losing the browser tab?** Inspect execution history first. Resume with the request ID. Browser disconnection does not establish that server-side generation stopped.

**Where is the MP4 saved?** Under n8n binary property `video`, not a chosen host directory. Add a storage node for durable archival and configure binary-data retention appropriately.

**Can I run hundreds of copies at once?** Queue deliberately and respect current account limits. This one-item workflow does not implement an account-wide semaphore.

## Validation boundary

Run `node --test tests/workflow.test.mjs` and `python3 -m unittest discover -s tests -p 'test_*.py'`. Offline checks execute Code-node logic, verify graph connections, exercise status/error/retry branches, and inspect Python headers. No API key is needed. A real n8n UI execution and paid generation have not been performed here.
