# -*- coding: utf-8 -*-
import json, io, urllib.request, sys

tok = io.open("token.txt").read().strip()
src = io.open(r"C:\Users\khs04\OneDrive\바탕 화면\claude\firestore.rules", encoding="utf-8").read()

BASE = "/databases/(default)/documents"
A = "playerA"
B = "playerB"
C = "stranger"

def auth(uid, anon=False):
    return {
        "uid": uid,
        "token": {
            "sub": uid,
            "firebase": {"sign_in_provider": "anonymous" if anon else "google.com"},
        },
    }

def move(r, c, by):
    return {"r": r, "c": c, "by": by}

# 진행 중인 판: A(흑)가 한 수 뒀고 지금은 B 차례
playing = {
    "players": [A, B],
    "hostName": "알파",
    "black": A, "white": B,
    "blackName": "알파", "whiteName": "브라보",
    "moves": [move(7, 7, A)],
    "turn": B,
    "status": "playing",
    "winner": None,
}

def with_moves(base, moves, turn=None, status=None):
    d = dict(base)
    d["moves"] = moves
    if turn: d["turn"] = turn
    if status: d["status"] = status
    return d

cases = []

def case(name, expect, method, path, uid, anon=False, resource=None, new_data=None):
    req = {"auth": auth(uid, anon), "path": BASE + path, "method": method}
    if new_data is not None:
        req["resource"] = {"data": new_data}
    c = {"expectation": expect, "request": req, "functionMocks": []}
    if resource is not None:
        c["resource"] = {"data": resource}
    cases.append((name, c))

# --- 온라인 대국 착수 ---
case("내 차례에 한 수 두기", "ALLOW", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, B)], turn=A))

case("상대 차례에 몰래 두기", "DENY", "update", "/matches/m1", A,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, A)], turn=B))

case("이미 둔 수를 고치기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(0, 0, A), move(7, 8, B)], turn=A))

case("한 번에 두 수 두기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, B), move(7, 9, B)], turn=A))

case("두고 나서 차례를 안 넘기기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, B)], turn=B))

case("판 밖에 두기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(99, 8, B)], turn=A))

case("남의 이름으로 두기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, A)], turn=A))

# --- 접근 ---
case("남의 진행 중인 판 훔쳐보기", "DENY", "get", "/matches/m1", C, resource=playing)
case("대국자는 자기 판을 본다", "ALLOW", "get", "/matches/m1", A, resource=playing)

waiting = {
    "players": [A],
    "hostName": "알파",
    "black": A, "blackName": "알파",
    "moves": [],
    "turn": A,
    "status": "waiting",
    "winner": None,
}
case("기다리는 방은 누구나 찾을 수 있다", "ALLOW", "get", "/matches/m2", C, resource=waiting)

case("빈 방에 상대로 들어가기", "ALLOW", "update", "/matches/m2", B,
     resource=waiting,
     new_data={**waiting, "players": [A, B], "status": "playing", "whiteName": "브라보", "white": B})

case("이미 찬 방에 끼어들기", "DENY", "update", "/matches/m1", C,
     resource=playing,
     new_data={**playing, "players": [A, C]})

case("게스트는 온라인 대국을 못 만든다", "DENY", "create", "/matches/m3", A, anon=True,
     new_data={"players": [A], "hostName": "알파", "moves": [], "status": "waiting"})

case("끝난 판은 다시 못 고친다", "DENY", "update", "/matches/m1", B,
     resource={**playing, "status": "done", "winner": A},
     new_data=with_moves(playing, [move(7, 7, A), move(7, 8, B)], turn=A, status="playing"))

# --- 광고 정지 ---
case("광고 보는 동안 시계 멈추기", "ALLOW", "update", "/matches/m1", B,
     resource=playing,
     new_data={**playing, "adPausedBy": B, "adPausedUntil": 1234})

case("광고 정지를 핑계로 한 수 끼워넣기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data={**with_moves(playing, [move(7, 7, A), move(7, 8, B)]), "adPausedBy": B})

case("남의 이름으로 시계 멈추기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data={**playing, "adPausedBy": A})

case("광고 정지로 차례 가로채기", "DENY", "update", "/matches/m1", B,
     resource=playing,
     new_data={**playing, "adPausedBy": B, "turn": A})

# --- 명예의 전당 ---
case("내 랭킹 줄 쓰기", "ALLOW", "create", "/leaderboard/" + A, A,
     new_data={"nickname": "알파", "maxLevel": 12, "clears": 11, "noItemClears": 2})

case("남의 랭킹 줄 바꾸기", "DENY", "create", "/leaderboard/" + B, A,
     new_data={"nickname": "가짜", "maxLevel": 30, "clears": 30, "noItemClears": 30})

case("게스트는 랭킹에 못 오른다", "DENY", "create", "/leaderboard/" + A, A, anon=True,
     new_data={"nickname": "알파", "maxLevel": 12, "clears": 11, "noItemClears": 2})

case("있을 수 없는 단계는 거절", "DENY", "create", "/leaderboard/" + A, A,
     new_data={"nickname": "알파", "maxLevel": 999, "clears": 11, "noItemClears": 2})

case("너무 짧은 닉네임은 거절", "DENY", "create", "/leaderboard/" + A, A,
     new_data={"nickname": "가", "maxLevel": 12, "clears": 11, "noItemClears": 2})

# --- 기존 기록 백업이 그대로인지 ---
case("내 기록 백업 쓰기", "ALLOW", "create", "/users/" + A + "/records/main", A,
     new_data={"snapshot": "{}"})
case("남의 기록 백업 읽기", "DENY", "get", "/users/" + B + "/records/main", A,
     resource={"snapshot": "{}"})
case("게스트도 자기 기록은 백업한다", "ALLOW", "create", "/users/" + A + "/records/main", A, anon=True,
     new_data={"snapshot": "{}"})

body = json.dumps({
    "source": {"files": [{"name": "firestore.rules", "content": src}]},
    "testSuite": {"testCases": [c for _, c in cases]},
}).encode("utf-8")

req = urllib.request.Request(
    "https://firebaserules.googleapis.com/v1/projects/omok-challenge:test",
    data=body,
    headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},
)
try:
    r = json.load(urllib.request.urlopen(req))
except Exception as e:
    sys.stdout.write("FAIL: " + e.read().decode("utf-8")[:2000] + "\n")
    sys.exit(1)

for i in r.get("issues", []):
    print("ISSUE:", i.get("severity"), i.get("description"))

results = r.get("testResults", [])
passed = failed = 0
for (name, _), res in zip(cases, results):
    state = res.get("state")
    if state == "SUCCESS":
        passed += 1
        print("  OK   " + name)
    else:
        failed += 1
        print("  X    " + name + "  -> " + str(state))
        for err in res.get("errorPosition", []) if isinstance(res.get("errorPosition"), list) else []:
            print("        ", err)
        if res.get("debugMessages"):
            for m in res["debugMessages"][:3]:
                print("        ", m)

print("\n통과 %d / 실패 %d" % (passed, failed))
