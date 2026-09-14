#!/usr/bin/env python3
"""
Lab6 Load Generator
Usage: python3 load_generator.py --users 20 --messages 30 --url http://10.1.75.79:3249
"""

import argparse
import random
import string
import time
import uuid
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import requests

warnings.filterwarnings("ignore")  # suppress SSL warnings

# ── CLI Args ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser(description="Lab6 Load Generator")
parser.add_argument("--url", default="http://10.1.75.79:3249", help="Load balancer URL")
parser.add_argument("--users", type=int, default=20, help="Number of concurrent users")
parser.add_argument("--messages", type=int, default=30, help="Messages per user")
parser.add_argument("--min-len", type=int, default=5, help="Min message length")
parser.add_argument("--max-len", type=int, default=300, help="Max message length")
parser.add_argument(
    "--min-delay", type=float, default=0.05, help="Min delay between messages (s)"
)
parser.add_argument(
    "--max-delay", type=float, default=0.5, help="Max delay between messages (s)"
)
args = parser.parse_args()

LB_URL = args.url.rstrip("/")

# ── Helpers ───────────────────────────────────────────────────────────────────


def random_text(n):
    return "".join(random.choices(string.ascii_letters + string.digits + " ", k=n))


def post_message(session, user_id, msg_id_str):
    msg_len = random.randint(args.min_len, args.max_len)
    payload = {
        "client-name": f"LoadUser_{user_id}",
        "msg": random_text(msg_len),
        "message_id": msg_id_str,
    }
    start = time.perf_counter()
    try:
        r = session.post(f"{LB_URL}/message", json=payload, verify=False, timeout=10)
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "type": "post",
            "status": r.status_code,
            "latency_ms": elapsed_ms,
            "ok": r.status_code == 200,
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "type": "post",
            "status": 0,
            "latency_ms": elapsed_ms,
            "ok": False,
            "error": str(e),
        }


def get_feed(session):
    start = time.perf_counter()
    try:
        r = session.get(f"{LB_URL}/feed", verify=False, timeout=10)
        elapsed_ms = (time.perf_counter() - start) * 1000
        count = len(r.json()) if r.status_code == 200 else 0
        return {
            "type": "feed",
            "status": r.status_code,
            "latency_ms": elapsed_ms,
            "ok": r.status_code == 200,
            "count": count,
        }
    except Exception as e:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "type": "feed",
            "status": 0,
            "latency_ms": elapsed_ms,
            "ok": False,
            "error": str(e),
        }


def simulate_user(user_id, num_messages):
    session = requests.Session()
    results = []
    for i in range(num_messages):
        msg_id = str(uuid.uuid4())
        results.append(post_message(session, user_id, msg_id))

        # Occasionally fetch /feed too
        if i % 5 == 0:
            results.append(get_feed(session))

        delay = random.uniform(args.min_delay, args.max_delay)
        time.sleep(delay)

    session.close()
    return results


# ── Run ───────────────────────────────────────────────────────────────────────

print(f"Starting load test: {args.users} users × {args.messages} messages → {LB_URL}")
print("=" * 60)

all_results = []
start_time = time.time()

with ThreadPoolExecutor(max_workers=args.users) as executor:
    futures = {
        executor.submit(simulate_user, uid, args.messages): uid
        for uid in range(args.users)
    }
    for fut in as_completed(futures):
        uid = futures[fut]
        try:
            res = fut.result()
            all_results.extend(res)
            print(f"  User {uid:3d}: {len(res)} requests done")
        except Exception as e:
            print(f"  User {uid:3d}: ERROR {e}")

total_time = time.time() - start_time

# ── Stats ─────────────────────────────────────────────────────────────────────

post_results = [r for r in all_results if r["type"] == "post"]
feed_results = [r for r in all_results if r["type"] == "feed"]

post_ok = [r for r in post_results if r["ok"]]
feed_ok = [r for r in feed_results if r["ok"]]


def stats(latencies):
    if not latencies:
        return {}
    s = sorted(latencies)
    n = len(s)
    return {
        "count": n,
        "avg": sum(s) / n,
        "min": s[0],
        "max": s[-1],
        "p50": s[int(n * 0.50)],
        "p90": s[int(n * 0.90)],
        "p95": s[int(n * 0.95)],
        "p99": s[int(n * 0.99)],
    }


post_lats = [r["latency_ms"] for r in post_ok]
feed_lats = [r["latency_ms"] for r in feed_ok]
ps = stats(post_lats)
fs = stats(feed_lats)

print("\n" + "=" * 60)
print("RESULTS SUMMARY")
print("=" * 60)
print(f"Total time       : {total_time:.1f}s")
print(f"Total requests   : {len(all_results)}")
print(f"Throughput       : {len(all_results)/total_time:.1f} req/s")
print()
print(f"POST /message:")
print(
    f"  Success rate   : {len(post_ok)}/{len(post_results)} ({100*len(post_ok)/max(len(post_results),1):.1f}%)"
)
if ps:
    print(f"  Avg latency    : {ps['avg']:.1f} ms")
    print(f"  P50            : {ps['p50']:.1f} ms")
    print(f"  P95            : {ps['p95']:.1f} ms")
    print(f"  P99            : {ps['p99']:.1f} ms")
print()
print(f"GET /feed:")
print(
    f"  Success rate   : {len(feed_ok)}/{len(feed_results)} ({100*len(feed_ok)/max(len(feed_results),1):.1f}%)"
)
if fs:
    print(f"  Avg latency    : {fs['avg']:.1f} ms")
    print(f"  P95            : {fs['p95']:.1f} ms")
if feed_ok:
    print(f"  Messages in DB : {feed_ok[-1].get('count', '?')}")

# ── Plots ─────────────────────────────────────────────────────────────────────

fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle(
    f"Lab6 Load Test — {args.users} users, {args.messages} msg/user\n{LB_URL}",
    fontsize=13,
)

# 1. Response time over requests
ax1 = axes[0, 0]
ax1.plot(post_lats, alpha=0.6, color="steelblue", linewidth=0.8, label="POST /message")
if feed_lats:
    # interpolate feed latencies to same x-axis
    ax1.plot(
        [i * len(post_lats) // len(feed_lats) for i in range(len(feed_lats))],
        feed_lats,
        alpha=0.6,
        color="orange",
        linewidth=0.8,
        label="GET /feed",
    )
ax1.set_title("Response Time per Request")
ax1.set_xlabel("Request #")
ax1.set_ylabel("Latency (ms)")
ax1.legend()
ax1.grid(True, alpha=0.3)

# 2. Latency distribution histogram
ax2 = axes[0, 1]
ax2.hist(post_lats, bins=50, color="steelblue", alpha=0.7, label="POST /message")
if feed_lats:
    ax2.hist(feed_lats, bins=50, color="orange", alpha=0.7, label="GET /feed")
ax2.set_title("Latency Distribution")
ax2.set_xlabel("Latency (ms)")
ax2.set_ylabel("Count")
ax2.legend()
ax2.grid(True, alpha=0.3)

# 3. Throughput over time (10s buckets)
ax3 = axes[1, 0]
if all_results:
    bucket_size = 5  # seconds
    buckets = {}
    for r in all_results:
        if "latency_ms" in r:
            # We don't have timestamps, approximate from position
            pass
    # Use request index / throughput approximation
    bucket_count = max(1, int(total_time / bucket_size))
    per_bucket = len(post_lats) // bucket_count if bucket_count else len(post_lats)
    bucket_lats = []
    for i in range(bucket_count):
        chunk = post_lats[i * per_bucket : (i + 1) * per_bucket]
        if chunk:
            bucket_lats.append(sum(chunk) / len(chunk))
    times = [i * bucket_size for i in range(len(bucket_lats))]
    ax3.plot(times, bucket_lats, marker="o", color="green")
    ax3.set_title(f"Avg Latency per {bucket_size}s Window")
    ax3.set_xlabel("Time (s)")
    ax3.set_ylabel("Avg Latency (ms)")
    ax3.grid(True, alpha=0.3)
    ax3.axhline(
        y=200, color="red", linestyle="--", alpha=0.5, label="Threshold (200ms)"
    )
    ax3.legend()

# 4. Percentile bar chart
ax4 = axes[1, 1]
if ps:
    labels = ["Avg", "P50", "P90", "P95", "P99", "Max"]
    values = [ps["avg"], ps["p50"], ps["p90"], ps["p95"], ps["p99"], ps["max"]]
    bars = ax4.bar(labels, values, color=["steelblue"] * 5 + ["red"])
    ax4.set_title("POST /message — Latency Percentiles")
    ax4.set_ylabel("Latency (ms)")
    ax4.grid(True, alpha=0.3, axis="y")
    for bar, val in zip(bars, values):
        ax4.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height() + 0.5,
            f"{val:.0f}ms",
            ha="center",
            va="bottom",
            fontsize=9,
        )

plt.tight_layout()
plt.savefig("load_test_results.png", dpi=150, bbox_inches="tight")
print("\nPlot saved: load_test_results.png")
