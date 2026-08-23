package com.broodsky85.omokchallenge;

import androidx.annotation.NonNull;

import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.FirebaseFirestoreException;
import com.google.firebase.firestore.ListenerRegistration;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QueryDocumentSnapshot;
import com.google.firebase.firestore.SetOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;

/**
 * 온라인 대국 한 판을 붙들고 있는 객체.
 *
 * 판 하나가 Firestore 문서 하나다. 착수는 moves 배열에 하나씩 쌓이고,
 * 양쪽은 같은 문서를 실시간으로 구독한다. 오목 승패 판정은 웹이 한다 —
 * 판정 코드가 이미 거기 있고, 양쪽이 같은 수순을 보므로 결과도 같다.
 *
 * 보안 규칙이 막아 주는 것: 남의 차례에 두기, 이미 둔 수 고치기,
 * 남의 판 훔쳐보기, 끝난 판 되살리기. 그래서 여기서는 흐름만 다룬다.
 */
class OnlineMatch {

    /** 웹으로 소식을 보내는 통로. MainActivity가 구현한다. */
    interface Bridge {
        void sendMatchState(String json);
        void sendMatchMessage(String message);
        void runOnUi(Runnable action);
    }

    static final int TURN_SECONDS = 60;      // 한 수에 주는 시간
    static final int AD_PAUSE_LIMIT = 3;     // 광고로 시계를 멈출 수 있는 판당 횟수
    static final double START_RATING = 1200; // 처음 등급
    static final double ELO_K = 32;          // 한 판에 움직이는 폭 (보안 규칙의 ±40 안)
    static final double RATING_TOLERANCE = 200;  // "비슷한 등급"으로 치는 범위
    private static final int INVITE_CODE_LENGTH = 6;
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 O,0,I,1 제외

    private final FirebaseFirestore db;
    private final FirebaseAuth auth;
    private final Bridge bridge;
    private final Random random = new Random();

    private ListenerRegistration matchListener;
    private String matchId;
    private String inviteCode;
    private String nickname = "";
    private String phase = "idle";           // idle / searching / waiting / playing / done
    private boolean queued;                  // 랜덤 매칭 대기열에 내 줄을 올려 뒀는지
    private int myAdPauses;
    private double myRating = START_RATING;
    private boolean ranked;                  // 등급에 반영하는 판인지 (친구 초대전은 아니다)
    private boolean ratingApplied;           // 한 판의 결과를 두 번 반영하지 않는다

    OnlineMatch(FirebaseFirestore db, FirebaseAuth auth, Bridge bridge) {
        this.db = db;
        this.auth = auth;
        this.bridge = bridge;
    }

    // ---------- 공통 ----------

    private String uid() {
        FirebaseUser user = auth.getCurrentUser();
        return user == null ? null : user.getUid();
    }

    private boolean requireLinkedUser() {
        FirebaseUser user = auth.getCurrentUser();
        if (user == null || user.isAnonymous()) {
            bridge.sendMatchMessage("온라인 대국은 Google 계정을 연결한 뒤에 이용할 수 있습니다.");
            return false;
        }
        return true;
    }

    private boolean requireNickname(String raw) {
        String name = raw == null ? "" : raw.trim();
        if (name.length() < 2 || name.length() > 12) {
            bridge.sendMatchMessage("닉네임을 2자 이상 12자 이하로 정한 뒤에 시작해 주세요.");
            return false;
        }
        nickname = name;
        return true;
    }

    private DocumentReference leaderboardRef() {
        String me = uid();
        return me == null ? null : db.collection("leaderboard").document(me);
    }

    /** 내 등급을 먼저 읽고 나서 하려던 일을 이어간다. 없으면 기본값으로 시작한다. */
    private void withMyRating(Runnable next) {
        DocumentReference ref = leaderboardRef();
        if (ref == null) { next.run(); return; }
        ref.get().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null && task.getResult().exists()) {
                Object raw = task.getResult().get("rating");
                if (raw instanceof Number) myRating = ((Number) raw).doubleValue();
            }
            next.run();
        });
    }

    private DocumentReference matchRef() {
        return matchId == null ? null : db.collection("matches").document(matchId);
    }

    private String newInviteCode() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < INVITE_CODE_LENGTH; i++) {
            sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
        }
        return sb.toString();
    }

    // ---------- 시작 ----------

    /** 랜덤 매칭: 기다리는 사람이 있으면 그 방에 들어가고, 없으면 내가 방을 열고 기다린다. */
    void findRandom(String rawNickname) {
        if (!requireLinkedUser() || !requireNickname(rawNickname)) return;
        leaveQuietly();
        phase = "searching";
        ranked = true;
        emitLocalState("상대를 찾는 중입니다…");
        withMyRating(this::searchQueue);
    }

    /* 비슷한 등급을 먼저 찾고, 그런 사람이 없으면 기다리는 사람 중 아무나 바로 잡는다.
       사람이 적을 때 등급만 고집하면 아무도 못 만나고 하염없이 기다리게 된다. */
    private void searchQueue() {
        final String me = uid();
        db.collection("matchQueue")
                .orderBy("createdAt", Query.Direction.ASCENDING)
                .limit(20)
                .get()
                .addOnCompleteListener(task -> {
                    String nearMatch = null, nearUid = null;    // 등급이 가까운 상대
                    String anyMatch = null, anyUid = null;      // 가장 오래 기다린 상대
                    if (task.isSuccessful() && task.getResult() != null) {
                        for (QueryDocumentSnapshot doc : task.getResult()) {
                            if (doc.getId().equals(me)) continue;
                            String candidate = doc.getString("matchId");
                            if (candidate == null || candidate.isEmpty()) continue;

                            if (anyMatch == null) {             // 시간순이라 첫 줄이 가장 오래 기다린 사람
                                anyMatch = candidate;
                                anyUid = doc.getId();
                            }
                            Object raw = doc.get("rating");
                            double theirs = raw instanceof Number ? ((Number) raw).doubleValue() : START_RATING;
                            if (nearMatch == null && Math.abs(theirs - myRating) <= RATING_TOLERANCE) {
                                nearMatch = candidate;
                                nearUid = doc.getId();
                            }
                        }
                    }
                    String targetMatch = nearMatch != null ? nearMatch : anyMatch;
                    String targetUid = nearMatch != null ? nearUid : anyUid;
                    if (targetMatch != null) {
                        if (nearMatch == null) bridge.sendMatchMessage("등급이 비슷한 상대가 없어 기다리던 분과 붙습니다.");
                        joinExisting(targetMatch, targetUid);
                    } else {
                        hostMatch(null);
                    }
                });
    }

    /** 친구 초대: 코드가 붙은 방을 열고 상대가 코드를 들고 오기를 기다린다. */
    void createInvite(String rawNickname) {
        if (!requireLinkedUser() || !requireNickname(rawNickname)) return;
        leaveQuietly();
        phase = "searching";
        // 친구끼리 짜고 점수를 올리는 것을 막기 위해 초대전은 등급에 넣지 않는다.
        ranked = false;
        emitLocalState("초대 방을 만드는 중입니다…");
        withMyRating(() -> hostMatch(newInviteCode()));
    }

    /** 친구가 준 코드로 그 방에 들어간다. */
    void joinInvite(String rawCode, String rawNickname) {
        if (!requireLinkedUser() || !requireNickname(rawNickname)) return;
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (code.length() != INVITE_CODE_LENGTH) {
            bridge.sendMatchMessage("초대 코드는 " + INVITE_CODE_LENGTH + "자리입니다. 다시 확인해 주세요.");
            return;
        }
        leaveQuietly();
        phase = "searching";
        ranked = false;
        emitLocalState("초대 방을 찾는 중입니다…");

        db.collection("invites").document(code).get().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null || !task.getResult().exists()) {
                phase = "idle";
                emitLocalState("그 코드의 방을 찾지 못했습니다. 코드가 맞는지, 아직 열려 있는지 확인해 주세요.");
                return;
            }
            String target = task.getResult().getString("matchId");
            if (target == null) {
                phase = "idle";
                emitLocalState("초대 정보가 올바르지 않습니다.");
                return;
            }
            inviteCode = code;
            withMyRating(() -> joinExisting(target, null));
        });
    }

    private void hostMatch(String code) {
        final String me = uid();
        if (me == null) return;
        DocumentReference ref = db.collection("matches").document();

        Map<String, Object> data = new HashMap<>();
        data.put("players", java.util.Collections.singletonList(me));
        data.put("hostName", nickname);
        data.put("black", me);              // 방을 연 사람이 흑, 선공
        data.put("blackName", nickname);
        data.put("moves", new ArrayList<Map<String, Object>>());
        data.put("turn", me);
        data.put("status", "waiting");
        data.put("winner", null);
        data.put("endReason", null);
        data.put("adPausedBy", null);
        data.put("adPausedUntil", null);
        data.put("turnStartedAt", FieldValue.serverTimestamp());
        data.put("createdAt", FieldValue.serverTimestamp());
        data.put("claims", new HashMap<String, Object>());
        data.put("ranked", code == null);
        Map<String, Object> ratings = new HashMap<>();
        ratings.put(me, myRating);
        data.put("ratings", ratings);
        if (code != null) data.put("inviteCode", code);

        ref.set(data).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                phase = "idle";
                emitLocalState("방을 만들지 못했습니다. 네트워크를 확인해 주세요.");
                return;
            }
            matchId = ref.getId();
            inviteCode = code;
            phase = "waiting";
            watchMatch();

            if (code != null) {
                Map<String, Object> invite = new HashMap<>();
                invite.put("matchId", ref.getId());
                invite.put("host", me);
                invite.put("createdAt", FieldValue.serverTimestamp());
                db.collection("invites").document(code).set(invite);
            } else {
                // 랜덤 대기열에 내 줄을 올려 다음 사람이 나를 찾게 한다.
                Map<String, Object> queue = new HashMap<>();
                queue.put("nickname", nickname);
                queue.put("matchId", ref.getId());
                queue.put("rating", myRating);
                queue.put("createdAt", FieldValue.serverTimestamp());
                db.collection("matchQueue").document(me).set(queue);
                queued = true;
            }
            emitLocalState(code != null
                    ? "초대 코드를 친구에게 알려주세요."
                    : "상대를 기다리는 중입니다…");
        });
    }

    /** 이미 열려 있는 방에 두 번째 사람으로 들어간다. 동시에 들어오는 경우를 트랜잭션으로 막는다. */
    private void joinExisting(String targetMatchId, String queuedOpponentUid) {
        final String me = uid();
        if (me == null) return;
        DocumentReference ref = db.collection("matches").document(targetMatchId);

        db.runTransaction(transaction -> {
            DocumentSnapshot snap = transaction.get(ref);
            if (!snap.exists()) throw new FirebaseFirestoreException("gone",
                    FirebaseFirestoreException.Code.ABORTED);
            if (!"waiting".equals(snap.getString("status"))) throw new FirebaseFirestoreException("taken",
                    FirebaseFirestoreException.Code.ABORTED);
            Object rawPlayers = snap.get("players");
            if (!(rawPlayers instanceof List) || ((List<?>) rawPlayers).size() != 1) {
                throw new FirebaseFirestoreException("taken", FirebaseFirestoreException.Code.ABORTED);
            }
            String host = String.valueOf(((List<?>) rawPlayers).get(0));
            if (host.equals(me)) throw new FirebaseFirestoreException("self",
                    FirebaseFirestoreException.Code.ABORTED);

            Map<String, Object> update = new HashMap<>();
            update.put("players", Arrays.asList(host, me));
            update.put("white", me);
            update.put("whiteName", nickname);
            update.put("status", "playing");
            update.put("turn", host);        // 흑(방을 연 사람)이 먼저 둔다
            update.put("turnStartedAt", FieldValue.serverTimestamp());
            update.put("ratings." + me, myRating);
            transaction.update(ref, update);
            return null;
        }).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                // 누가 먼저 채갔거나 방이 닫혔다. 랜덤이면 내가 방을 열고 기다린다.
                if (inviteCode != null) {
                    phase = "idle";
                    emitLocalState("그 방은 이미 대국이 시작되었거나 닫혔습니다.");
                    inviteCode = null;
                } else {
                    hostMatch(null);
                }
                return;
            }
            matchId = targetMatchId;
            phase = "playing";
            watchMatch();
            // 짝을 지었으니 상대의 대기열 줄은 필요 없다. 자기 줄만 지울 수 있어 내 것만 정리한다.
            clearMyQueueEntry();
            emitLocalState("대국이 시작되었습니다.");
        });
    }

    // ---------- 진행 ----------

    private void watchMatch() {
        stopWatching();
        DocumentReference ref = matchRef();
        if (ref == null) return;
        matchListener = ref.addSnapshotListener((snapshot, error) -> {
            if (error != null || snapshot == null || !snapshot.exists()) return;
            bridge.runOnUi(() -> emitSnapshot(snapshot, null));
        });
    }

    private void stopWatching() {
        if (matchListener != null) {
            matchListener.remove();
            matchListener = null;
        }
    }

    /** 한 수 둔다. 규칙이 내 차례인지 다시 확인하므로 여기서는 흐름만 맞춘다. */
    void move(int r, int c) {
        final String me = uid();
        DocumentReference ref = matchRef();
        if (ref == null || me == null) return;
        if (r < 0 || r > 14 || c < 0 || c > 14) return;

        db.runTransaction(transaction -> {
            DocumentSnapshot snap = transaction.get(ref);
            if (!snap.exists() || !"playing".equals(snap.getString("status"))) {
                throw new FirebaseFirestoreException("not playing", FirebaseFirestoreException.Code.ABORTED);
            }
            if (!me.equals(snap.getString("turn"))) {
                throw new FirebaseFirestoreException("not my turn", FirebaseFirestoreException.Code.ABORTED);
            }
            List<Map<String, Object>> moves = readMoves(snap);
            for (Map<String, Object> m : moves) {
                if (toInt(m.get("r")) == r && toInt(m.get("c")) == c) {
                    throw new FirebaseFirestoreException("occupied", FirebaseFirestoreException.Code.ABORTED);
                }
            }
            Map<String, Object> placed = new HashMap<>();
            placed.put("r", r);
            placed.put("c", c);
            placed.put("by", me);
            moves.add(placed);

            String opponent = otherPlayer(snap, me);
            Map<String, Object> update = new HashMap<>();
            update.put("moves", moves);
            update.put("turn", opponent);
            update.put("turnStartedAt", FieldValue.serverTimestamp());
            update.put("adPausedBy", null);
            update.put("adPausedUntil", null);
            transaction.update(ref, update);
            return null;
        }).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) bridge.sendMatchMessage("착수가 반영되지 않았습니다. 다시 시도해 주세요.");
        });
    }

    /**
     * 판을 끝낸다. 웹이 오목 판정을 해서 결과를 넘긴다.
     * winner 는 "me" / "opponent" / "draw".
     */
    void finish(String winner, String reason) {
        final String me = uid();
        DocumentReference ref = matchRef();
        if (ref == null || me == null) return;

        ref.get().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null || !task.getResult().exists()) return;
            DocumentSnapshot snap = task.getResult();
            if ("done".equals(snap.getString("status"))) {
                // 상대가 먼저 끝냈다. 판은 그대로 두고 내 신고만 남긴다.
                String settled = snap.getString("winner");
                String mine = "draw".equals(settled) ? "draw" : (me.equals(settled) ? "win" : "lose");
                Map<String, Object> claimOnly = new HashMap<>();
                claimOnly.put("claims." + me, mine);
                ref.update(claimOnly);
                return;
            }

            String winnerUid;
            if ("draw".equals(winner)) winnerUid = "draw";
            else if ("opponent".equals(winner)) winnerUid = otherPlayer(snap, me);
            else winnerUid = me;

            Map<String, Object> update = new HashMap<>();
            update.put("status", "done");
            update.put("winner", winnerUid);
            update.put("endReason", reason == null ? "five" : reason);
            // 내 몫의 결과 신고. 양쪽 신고가 맞아떨어져야 등급에 반영된다.
            update.put("claims." + me, "draw".equals(winnerUid) ? "draw"
                    : (me.equals(winnerUid) ? "win" : "lose"));
            ref.update(update);
        });
        clearMyQueueEntry();
    }

    /** 상대가 제한 시간을 넘겼다고 알린다. 시계는 서버 시각으로 잰다. */
    void claimTimeout() {
        final String me = uid();
        DocumentReference ref = matchRef();
        if (ref == null || me == null) return;
        ref.get().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) return;
            DocumentSnapshot snap = task.getResult();
            if (!"playing".equals(snap.getString("status"))) return;
            if (me.equals(snap.getString("turn"))) return;          // 내 차례면 넘긴 건 나다
            finish("me", "timeout");
        });
    }

    /** 광고를 보는 동안 시계를 멈춘다. 판당 횟수를 넘기면 멈추지 않는다. */
    boolean beginAdPause() {
        DocumentReference ref = matchRef();
        final String me = uid();
        if (ref == null || me == null || !"playing".equals(phase)) return false;
        if (myAdPauses >= AD_PAUSE_LIMIT) {
            bridge.sendMatchMessage("이 판에서는 광고로 시계를 더 멈출 수 없습니다. 시간이 계속 흐릅니다.");
            return false;
        }
        myAdPauses++;
        Map<String, Object> update = new HashMap<>();
        update.put("adPausedBy", me);
        update.put("adPausedUntil", null);
        ref.update(update);
        return true;
    }

    /** 광고가 끝나 시계를 다시 돌린다. 남은 시간은 그 자리부터 이어진다. */
    void endAdPause() {
        DocumentReference ref = matchRef();
        final String me = uid();
        if (ref == null || me == null) return;
        Map<String, Object> update = new HashMap<>();
        update.put("adPausedBy", null);
        update.put("adPausedUntil", null);
        update.put("turnStartedAt", FieldValue.serverTimestamp());
        ref.update(update);
    }

    /** 대국을 떠난다. 진행 중이었다면 기권으로 끝난다. */
    void leave() {
        if ("playing".equals(phase)) {
            finish("opponent", "leave");
        } else {
            DocumentReference ref = matchRef();
            if (ref != null && "waiting".equals(phase)) ref.delete();
            if (inviteCode != null) db.collection("invites").document(inviteCode).delete();
        }
        leaveQuietly();
        phase = "idle";
        emitLocalState("대국에서 나왔습니다.");
    }

    /** 상태만 정리한다. 새 대국을 시작하기 전에 부른다. */
    private void leaveQuietly() {
        stopWatching();
        clearMyQueueEntry();
        matchId = null;
        inviteCode = null;
        myAdPauses = 0;
        ratingApplied = false;
    }

    private void clearMyQueueEntry() {
        String me = uid();
        if (me == null || !queued) return;
        queued = false;
        db.collection("matchQueue").document(me).delete();
    }

    // ---------- 상태 전달 ----------

    private void emitLocalState(String message) {
        JSONObject out = new JSONObject();
        try {
            out.put("phase", phase);
            out.put("matchId", matchId == null ? JSONObject.NULL : matchId);
            out.put("inviteCode", inviteCode == null ? JSONObject.NULL : inviteCode);
            out.put("nickname", nickname);
            out.put("turnSeconds", TURN_SECONDS);
            out.put("adPauseLeft", Math.max(0, AD_PAUSE_LIMIT - myAdPauses));
            out.put("myRating", Math.round(myRating));
            out.put("ranked", ranked);
            if (message != null) out.put("message", message);
        } catch (Exception ignored) { }
        bridge.sendMatchState(out.toString());
    }

    private void emitSnapshot(@NonNull DocumentSnapshot snap, String message) {
        final String me = uid();
        if (me == null) return;

        String status = snap.getString("status");
        String black = snap.getString("black");
        String turn = snap.getString("turn");
        String winner = snap.getString("winner");
        boolean iAmBlack = me.equals(black);

        if ("playing".equals(status)) phase = "playing";
        else if ("done".equals(status)) phase = "done";
        else if ("waiting".equals(status)) phase = "waiting";

        JSONObject out = new JSONObject();
        try {
            out.put("phase", phase);
            out.put("matchId", matchId == null ? JSONObject.NULL : matchId);
            out.put("inviteCode", inviteCode == null ? JSONObject.NULL : inviteCode);
            out.put("myColor", iAmBlack ? "black" : "white");
            out.put("myTurn", me.equals(turn));
            out.put("turnSeconds", TURN_SECONDS);
            out.put("adPauseLeft", Math.max(0, AD_PAUSE_LIMIT - myAdPauses));
            out.put("ranked", Boolean.TRUE.equals(snap.getBoolean("ranked")));
            out.put("myRating", Math.round(myRating));

            double shownOpponentRating = START_RATING;
            Object rawRatings = snap.get("ratings");
            if (rawRatings instanceof Map) {
                Object value = ((Map<?, ?>) rawRatings).get(otherPlayer(snap, me));
                if (value instanceof Number) shownOpponentRating = ((Number) value).doubleValue();
            }
            out.put("opponentRating", Math.round(shownOpponentRating));

            String opponentName = iAmBlack ? snap.getString("whiteName") : snap.getString("blackName");
            out.put("opponent", opponentName == null ? "" : opponentName);

            String pausedBy = snap.getString("adPausedBy");
            out.put("adPaused", pausedBy == null ? JSONObject.NULL
                    : (me.equals(pausedBy) ? "me" : "opponent"));

            Object startedAt = snap.get("turnStartedAt");
            long startedMillis = 0;
            if (startedAt instanceof com.google.firebase.Timestamp) {
                startedMillis = ((com.google.firebase.Timestamp) startedAt).toDate().getTime();
            }
            out.put("turnStartedAt", startedMillis);
            out.put("now", System.currentTimeMillis());

            JSONArray moves = new JSONArray();
            for (Map<String, Object> m : readMoves(snap)) {
                JSONObject one = new JSONObject();
                one.put("r", toInt(m.get("r")));
                one.put("c", toInt(m.get("c")));
                one.put("mine", me.equals(String.valueOf(m.get("by"))));
                moves.put(one);
            }
            out.put("moves", moves);

            if ("done".equals(status)) {
                if ("draw".equals(winner)) out.put("result", "draw");
                else if (me.equals(winner)) out.put("result", "win");
                else out.put("result", "lose");
                out.put("endReason", snap.getString("endReason"));
            }
            if (message != null) out.put("message", message);
        } catch (Exception ignored) { }
        bridge.sendMatchState(out.toString());
        maybeApplyRating(snap);
    }

    /* 양쪽 신고가 맞아떨어질 때만 등급을 움직인다.
       한쪽만 신고했거나 서로 다르게 신고했으면 아무 일도 일어나지 않는다.
       서버 판정이 없는 동안 조작을 억제하는 장치다 — 혼자서는 점수를 올릴 수 없다. */
    private void maybeApplyRating(DocumentSnapshot snap) {
        if (ratingApplied) return;
        if (!"done".equals(snap.getString("status"))) return;
        if (!Boolean.TRUE.equals(snap.getBoolean("ranked"))) return;   // 친구 초대전은 등급 밖이다

        final String me = uid();
        if (me == null) return;
        String opponent = otherPlayer(snap, me);
        if (opponent.equals(me)) return;

        Object rawClaims = snap.get("claims");
        if (!(rawClaims instanceof Map)) return;
        Map<?, ?> claims = (Map<?, ?>) rawClaims;
        Object mineRaw = claims.get(me);
        Object theirsRaw = claims.get(opponent);
        if (mineRaw == null || theirsRaw == null) return;              // 아직 둘 다 신고하지 않았다

        String mine = String.valueOf(mineRaw);
        String theirs = String.valueOf(theirsRaw);
        boolean agreed = ("win".equals(mine) && "lose".equals(theirs))
                || ("lose".equals(mine) && "win".equals(theirs))
                || ("draw".equals(mine) && "draw".equals(theirs));
        if (!agreed) {
            ratingApplied = true;
            bridge.sendMatchMessage("양쪽 결과가 달라 이 판은 등급에 반영하지 않습니다.");
            return;
        }

        double theirRating = START_RATING;
        Object rawRatings = snap.get("ratings");
        if (rawRatings instanceof Map) {
            Object value = ((Map<?, ?>) rawRatings).get(opponent);
            if (value instanceof Number) theirRating = ((Number) value).doubleValue();
            Object mineValue = ((Map<?, ?>) rawRatings).get(me);
            if (mineValue instanceof Number) myRating = ((Number) mineValue).doubleValue();
        }

        double score = "win".equals(mine) ? 1 : ("draw".equals(mine) ? 0.5 : 0);
        double expected = 1 / (1 + Math.pow(10, (theirRating - myRating) / 400));
        double updated = myRating + ELO_K * (score - expected);
        if (updated < 0) updated = 0;
        if (updated > 4000) updated = 4000;
        final double next = Math.round(updated);
        final double delta = next - myRating;

        ratingApplied = true;
        DocumentReference ref = leaderboardRef();
        if (ref == null) return;
        Map<String, Object> update = new HashMap<>();
        update.put("rating", next);
        update.put("updatedAt", FieldValue.serverTimestamp());
        ref.set(update, SetOptions.merge()).addOnCompleteListener(task -> {
            if (!task.isSuccessful()) return;
            myRating = next;
            bridge.sendMatchMessage(String.format(Locale.KOREA, "등급 %+.0f (%.0f점)", delta, next));
        });
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> readMoves(DocumentSnapshot snap) {
        Object raw = snap.get("moves");
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw instanceof List) {
            for (Object item : (List<?>) raw) {
                if (item instanceof Map) out.add(new HashMap<>((Map<String, Object>) item));
            }
        }
        return out;
    }

    private String otherPlayer(DocumentSnapshot snap, String me) {
        Object raw = snap.get("players");
        if (raw instanceof List) {
            for (Object item : (List<?>) raw) {
                String uid = String.valueOf(item);
                if (!uid.equals(me)) return uid;
            }
        }
        return me;
    }

    private int toInt(Object value) {
        return value instanceof Number ? ((Number) value).intValue() : -1;
    }

    void dispose() {
        stopWatching();
        clearMyQueueEntry();
    }
}
