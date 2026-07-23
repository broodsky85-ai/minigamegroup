package com.broodsky85.omokchallenge;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthUserCollisionException;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String GAME_URL = "file:///android_asset/web/omok.html";
    private static final String LOCAL_ASSET_PREFIX = "file:///android_asset/web/";
    private static final String REWARDED_AD_UNIT_ID = BuildConfig.REWARDED_AD_UNIT_ID;
    private static final Set<String> ITEM_TYPES = new HashSet<>(Arrays.asList("hint", "undo", "danger", "future"));

    private WebView webView;
    private RewardedAd rewardedAd;
    private boolean adLoading;
    private String pendingRewardType;
    private FirebaseAuth firebaseAuth;
    private FirebaseFirestore firestore;
    private CredentialManager credentialManager;
    private boolean syncInProgress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.game_web_view);
        firebaseAuth = FirebaseAuth.getInstance();
        firestore = FirebaseFirestore.getInstance();
        credentialManager = CredentialManager.create(this);
        configureWebView();
        webView.addJavascriptInterface(new AdsBridge(), "OmokAds");
        webView.addJavascriptInterface(new AccountBridge(), "OmokAccount");
        webView.loadUrl(GAME_URL);
        ensureSignedIn();

        MobileAds.initialize(this, status -> runOnUiThread(this::loadRewardedAd));
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith(LOCAL_ASSET_PREFIX)) return false;
                if ("https".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                notifyAccountStatus();
                syncRecords();
            }
        });
    }

    private void loadRewardedAd() {
        if (adLoading || rewardedAd != null) return;
        adLoading = true;
        RewardedAd.load(this, REWARDED_AD_UNIT_ID, new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(RewardedAd ad) {
                        adLoading = false;
                        rewardedAd = ad;
                        sendAdMessage("보상형 광고가 준비되었습니다.");
                        if (pendingRewardType != null) showLoadedRewardedAd();
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        adLoading = false;
                        pendingRewardType = null;
                        sendAdMessage("광고를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
                    }
                });
    }

    private void requestRewardedAd(String type) {
        if (!ITEM_TYPES.contains(type)) return;
        pendingRewardType = type;
        if (rewardedAd == null) {
            sendAdMessage("보상형 광고를 준비하고 있습니다…");
            loadRewardedAd();
            return;
        }
        showLoadedRewardedAd();
    }

    private void showLoadedRewardedAd() {
        if (rewardedAd == null || pendingRewardType == null) return;
        String rewardType = pendingRewardType;
        pendingRewardType = null;
        RewardedAd ad = rewardedAd;
        rewardedAd = null;
        final boolean[] rewardGranted = {false};

        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdDismissedFullScreenContent() {
                if (!rewardGranted[0]) sendAdMessage("광고가 종료되어 아이템이 충전되지 않았습니다.");
                loadRewardedAd();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError error) {
                sendAdMessage("광고를 표시하지 못했습니다. 다시 시도해 주세요.");
                loadRewardedAd();
            }
        });

        ad.show(this, rewardItem -> {
            rewardGranted[0] = true;
            grantItemReward(rewardType);
        });
    }

    private void grantItemReward(String type) {
        String script = "window.grantOmokItemReward && window.grantOmokItemReward(" + JSONObject.quote(type) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void sendAdMessage(String message) {
        String script = "window.setOmokAdMessage && window.setOmokAdMessage(" + JSONObject.quote(message) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void ensureSignedIn() {
        if (firebaseAuth.getCurrentUser() != null) {
            notifyAccountStatus();
            return;
        }
        firebaseAuth.signInAnonymously().addOnCompleteListener(this, task -> {
            if (task.isSuccessful()) {
                notifyAccountStatus();
                syncRecords();
            } else {
                sendAccountMessage("게스트 로그인을 시작하지 못했습니다. 네트워크를 확인해 주세요.");
            }
        });
    }

    private void beginGoogleSignIn() {
        GetGoogleIdOption googleIdOption = new GetGoogleIdOption.Builder()
                .setFilterByAuthorizedAccounts(false)
                .setServerClientId(getString(R.string.default_web_client_id))
                .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleIdOption)
                .build();
        credentialManager.getCredentialAsync(
                this,
                request,
                new CancellationSignal(),
                this::runOnUiThread,
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        handleGoogleCredential(result.getCredential());
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        sendAccountMessage("Google 로그인이 취소되었거나 완료되지 않았습니다.");
                    }
                }
        );
    }

    private void handleGoogleCredential(Credential credential) {
        if (!(credential instanceof CustomCredential)
                || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            sendAccountMessage("지원하지 않는 로그인 정보입니다.");
            return;
        }
        try {
            GoogleIdTokenCredential token = GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
            AuthCredential firebaseCredential = GoogleAuthProvider.getCredential(token.getIdToken(), null);
            FirebaseUser current = firebaseAuth.getCurrentUser();
            if (current != null && current.isAnonymous()) {
                current.linkWithCredential(firebaseCredential).addOnCompleteListener(this, task -> {
                    if (task.isSuccessful()) {
                        onGoogleAuthenticated();
                    } else if (task.getException() instanceof FirebaseAuthUserCollisionException) {
                        signInExistingGoogleAccount(firebaseCredential);
                    } else {
                        sendAccountMessage("Google 계정 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
                    }
                });
            } else {
                signInExistingGoogleAccount(firebaseCredential);
            }
        } catch (Exception error) {
            sendAccountMessage("Google 로그인 정보를 읽지 못했습니다.");
        }
    }

    private void signInExistingGoogleAccount(AuthCredential credential) {
        firebaseAuth.signInWithCredential(credential).addOnCompleteListener(this, task -> {
            if (task.isSuccessful()) onGoogleAuthenticated();
            else sendAccountMessage("Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        });
    }

    private void onGoogleAuthenticated() {
        notifyAccountStatus();
        sendAccountMessage("Google 계정이 연결되었습니다. 기록을 동기화합니다.");
        syncRecords();
    }

    private void notifyAccountStatus() {
        if (webView == null) return;
        FirebaseUser user = firebaseAuth.getCurrentUser();
        JSONObject status = new JSONObject();
        try {
            status.put("signedIn", user != null);
            status.put("anonymous", user == null || user.isAnonymous());
            status.put("name", user == null || user.getDisplayName() == null ? "" : user.getDisplayName());
            status.put("email", user == null || user.getEmail() == null ? "" : user.getEmail());
        } catch (Exception ignored) { }
        String script = "window.onOmokAccountChanged && window.onOmokAccountChanged(" + status + ");";
        webView.evaluateJavascript(script, null);
    }

    private void sendAccountMessage(String message) {
        if (webView == null) return;
        String script = "window.setOmokAccountMessage && window.setOmokAccountMessage(" + JSONObject.quote(message) + ");";
        webView.evaluateJavascript(script, null);
    }

    private String decodeJavascriptString(String value) {
        if (value == null || "null".equals(value) || "undefined".equals(value)) return null;
        try {
            return new JSONArray("[" + value + "]").getString(0);
        } catch (Exception error) {
            return null;
        }
    }

    private DocumentReference recordDocument(FirebaseUser user) {
        return firestore.collection("users").document(user.getUid())
                .collection("records").document("main");
    }

    private void syncRecords() {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        if (user == null) {
            ensureSignedIn();
            return;
        }
        if (syncInProgress || webView == null) return;
        syncInProgress = true;
        webView.evaluateJavascript(
                "window.OmokRecords ? JSON.stringify(window.OmokRecords.getSnapshot()) : null",
                result -> {
                    String localJson = decodeJavascriptString(result);
                    if (localJson == null) {
                        syncInProgress = false;
                        return;
                    }
                    DocumentReference document = recordDocument(user);
                    document.get().addOnCompleteListener(this, task -> {
                        if (!task.isSuccessful()) {
                            syncInProgress = false;
                            sendAccountMessage("클라우드 기록을 불러오지 못했습니다.");
                            return;
                        }
                        String cloudJson = task.getResult().exists()
                                ? task.getResult().getString("snapshot") : null;
                        if (cloudJson == null || cloudJson.isEmpty()) {
                            uploadSnapshot(document, localJson);
                            return;
                        }
                        String mergeScript = "JSON.stringify(window.OmokRecords.mergeSnapshot(JSON.parse("
                                + JSONObject.quote(cloudJson) + ")))";
                        webView.evaluateJavascript(mergeScript, mergedResult -> {
                            String mergedJson = decodeJavascriptString(mergedResult);
                            uploadSnapshot(document, mergedJson == null ? localJson : mergedJson);
                        });
                    });
                }
        );
    }

    private void uploadSnapshot(DocumentReference document, String snapshot) {
        Map<String, Object> data = new HashMap<>();
        data.put("snapshot", snapshot);
        data.put("updatedAt", FieldValue.serverTimestamp());
        document.set(data).addOnCompleteListener(this, task -> {
            syncInProgress = false;
            sendAccountMessage(task.isSuccessful()
                    ? "기록 동기화가 완료되었습니다."
                    : "기록 동기화에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        });
    }

    private void signOutToGuest() {
        firebaseAuth.signOut();
        ensureSignedIn();
        sendAccountMessage("Google 계정에서 로그아웃했습니다. 기록은 이 기기에 남아 있습니다.");
    }

    private void deleteCurrentAccount() {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        if (user == null) return;
        DocumentReference document = recordDocument(user);
        document.delete().continueWithTask(task -> user.delete()).addOnCompleteListener(this, task -> {
            if (task.isSuccessful()) {
                webView.evaluateJavascript("window.OmokRecords && window.OmokRecords.clearAll();", null);
                firebaseAuth.signOut();
                ensureSignedIn();
                sendAccountMessage("계정과 클라우드 기록을 삭제했습니다.");
            } else {
                sendAccountMessage("계정 삭제를 완료하지 못했습니다. 다시 로그인한 뒤 시도해 주세요.");
            }
        });
    }

    public class AdsBridge {
        @JavascriptInterface
        public void showRewarded(String type) {
            runOnUiThread(() -> requestRewardedAd(type));
        }
    }

    public class AccountBridge {
        @JavascriptInterface
        public void getStatus() {
            runOnUiThread(() -> {
                ensureSignedIn();
                notifyAccountStatus();
            });
        }

        @JavascriptInterface
        public void signInWithGoogle() {
            runOnUiThread(MainActivity.this::beginGoogleSignIn);
        }

        @JavascriptInterface
        public void syncNow() {
            runOnUiThread(MainActivity.this::syncRecords);
        }

        @JavascriptInterface
        public void recordsChanged() {
            runOnUiThread(MainActivity.this::syncRecords);
        }

        @JavascriptInterface
        public void signOut() {
            runOnUiThread(MainActivity.this::signOutToGuest);
        }

        @JavascriptInterface
        public void deleteAccount() {
            runOnUiThread(MainActivity.this::deleteCurrentAccount);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        webView.removeJavascriptInterface("OmokAds");
        webView.removeJavascriptInterface("OmokAccount");
        webView.destroy();
        super.onDestroy();
    }
}
