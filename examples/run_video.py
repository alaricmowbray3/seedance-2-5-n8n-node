"""One explicit generation, or resume an existing job. Python 3.9+."""
import argparse
import json
import os
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen


def request(base, key, path, body=None, binary=False):
    headers = {"Authorization": f"Bearer {key}", "User-Agent": "n8n-video-diagnostic/1.0"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = Request(base.rstrip("/") + path, data=data, headers=headers)
    with urlopen(req, timeout=90) as response:
        return response.read() if binary else json.load(response)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume")
    parser.add_argument("--output", type=Path, default=Path("video.mp4"))
    args = parser.parse_args()
    if args.output.exists():
        parser.error("output already exists; choose a new path")
    base = os.getenv("SEEDANCE_BASE_URL", "https://argolink.io/v1")
    key = os.environ["SEEDANCE_API_KEY"]
    job_id = args.resume
    if not job_id:
        body = {"model": "seedance-2.5", "prompt": "A paper boat drifts across a rain puddle at dawn.",
                "duration": 5, "resolution": "720p", "aspect_ratio": "16:9", "generate_audio": True}
        job_id = request(base, key, "/videos/generations", body)["request_id"]
    if not isinstance(job_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", job_id):
        raise ValueError("invalid request_id; inspect submission before retrying")
    print(f"request_id={job_id}", flush=True)
    deadline = time.monotonic() + 3600
    for _ in range(240):
        if time.monotonic() >= deadline:
            break
        status = request(base, key, f"/videos/{job_id}")
        if status.get("status") == "done":
            data = request(base, key, f"/videos/{job_id}/content", binary=True)
            with args.output.open("xb") as output:
                output.write(data)
            print(args.output)
            return
        if status.get("status") != "pending":
            raise RuntimeError(f"job {job_id}: {status}")
        time.sleep(10)
    raise TimeoutError(f"resume {job_id}; do not submit again")


if __name__ == "__main__":
    main()
