package com.broodsky85.omokchallenge;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.CancellationSignal;
import android.util.DisplayMetrics;
import android.webkit.JsResult;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.view.View;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.view.WindowInsetsController;
import android.view.WindowManager;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseAuthUserCollisionException;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;
import com.google.firebase.firestore.CollectionReference;
import com.google.firebase.firestore.DocumentReference;
import com.google.firebase.firestore.DocumentSnapshot;
import com.google.firebase.firestore.FieldValue;
import com.google.firebase.firestore.FirebaseFirestore;
import com.google.firebase.firestore.Query;
import com.google.firebase.firestore.QuerySnapshot;
import com.google.firebase.firestore.SetOptions;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public class MainActivity extends ComponentActivity {
    private static final String GAME_URL = "file:///android_asset/web/omok.html";
    private static final String REWARDED_AD_UNIT_ID = BuildConfig.REWARDED_AD_UNIT_ID;
    private static final String BANNER_AD_UNIT_ID = BuildConfig.BANNER_AD_UNIT_ID;
    private static final Set<String> ITEM_TYPES = new HashSet<>(Arrays.asList("hint", "undo", "danger", "future"));
    private static final int LEADERBOARD_LIMIT = 50;
    private static final int MAX_LEVEL = 30;

    private WebView webView;
    private FrameLayout bannerContainer;
    private AdView bannerAdView;
    private boolean bannerWanted;       // 웹 화면이 배너를 원하는 상태인지
    private boolean bannerLoaded;       // 실제로 채워진 배너가 있는지
    private RewardedAd rewardedAd;
    private boolean adLoading;
    private boolean mobileAdsStarted;
    private String pendingRewardType;
    private ConsentInformation consentInformation;
    private FirebaseAuth firebaseAuth;
    private FirebaseFirestore firestore;
    private CredentialManager credentialManager;
    private boolean syncInProgress;
    private AlertDialog jsConfirmDialog;
    private JsResult pendingJsResult;
    private AlertDialog exitDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.game_web_view);
        bannerContainer = findViewById(R.id.banner_container);
        firebaseAuth = FirebaseAuth.getInstance();
        firestore = FirebaseFirestore.getInstance();
        credentialManager = CredentialManager.create(this);
        configureWebView();
        webView.addJavascriptInterface(new AdsBridge(), "OmokAds");
        webView.addJavascriptInterface(new AccountBridge(), "OmokAccount");
        webView.loadUrl(GAME_URL);
        ensureSignedIn();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleSystemBack();
            }
        });

        requestUserConsent();
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
        settings.setTextZoom(100);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // 대국 중단과 재시작에 쓰는 window.confirm()을 Android에서도 실제로 표시한다.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                dismissJsConfirm();
                pendingJsResult = result;
                jsConfirmDialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("확인", (dialog, which) -> resolveJsConfirm(true))
                        .setNegativeButton("취소", (dialog, which) -> resolveJsConfirm(false))
                        .setOnCancelListener(dialog -> resolveJsConfirm(false))
                        .create();
                jsConfirmDialog.setOnDismissListener(dialog -> {
                    if (pendingJsResult == result) resolveJsConfirm(false);
                    if (jsConfirmDialog == dialog) jsConfirmDialog = null;
                });
                jsConfirmDialog.show();
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri.toString().startsWith(GAME_URL)) return false;
                if ("file".equals(uri.getScheme())) {
                    view.loadUrl(GAME_URL);
                    return true;
                }
                if ("https".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!url.startsWith(GAME_URL)) {
                    view.loadUrl(GAME_URL);
                    return;
                }
                notifyAccountStatus();
                notifyPrivacyOptionsAvailability();
                syncRecords();
            }
        });
    }

    private void requestUserConsent() {
        consentInformation = UserMessagingPlatform.getConsentInformation(this);
        ConsentRequestParameters parameters = new ConsentRequestParameters.Builder().build();
        consentInformation.requestConsentInfoUpdate(
                this,
                parameters,
                () -> {
                    UserMessagingPlatform.loadAndShowConsentFormIfRequired(this, formError -> {
                        notifyPrivacyOptionsAvailability();
                        initializeMobileAdsIfAllowed();
                    });
                    notifyPrivacyOptionsAvailability();
                    initializeMobileAdsIfAllowed();
                },
                requestError -> {
                    notifyPrivacyOptionsAvailability();
                    initializeMobileAdsIfAllowed();
                }
        );
        // 이전 실행에서 이미 동의가 완료된 사용자는 폼 응답을 기다리지 않고 광고를 준비한다.
        initializeMobileAdsIfAllowed();
    }

    private void resolveJsConfirm(boolean confirmed) {
        JsResult result = pendingJsResult;
        pendingJsResult = null;
        if (result == null) return;
        if (confirmed) result.confirm();
        else result.cancel();
    }

    private void dismissJsConfirm() {
        AlertDialog dialog = jsConfirmDialog;
        resolveJsConfirm(false);
        jsConfirmDialog = null;
        if (dialog != null && dialog.isShowing()) dialog.dismiss();
    }

    private synchronized void initializeMobileAdsIfAllowed() {
        if (mobileAdsStarted || consentInformation == null || !consentInformation.canRequestAds()) return;
        mobileAdsStarted = true;
        MobileAds.initialize(this, status -> runOnUiThread(() -> {
            loadRewardedAd();
            setupBannerAd();
        }));
    }

    private boolean privacyOptionsRequired() {
        return consentInformation != null
                && consentInformation.getPrivacyOptionsRequirementStatus()
                == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
    }

    private void notifyPrivacyOptionsAvailability() {
        if (webView == null) return;
        String script = "window.setOmokPrivacyOptionsAvailable && window.setOmokPrivacyOptionsAvailable("
                + privacyOptionsRequired() + ");";
        webView.evaluateJavascript(script, null);
    }

    private void showPrivacyOptions() {
        if (!privacyOptionsRequired()) {
            sendAdMessage("현재 지역에서는 별도의 광고 개인정보 설정이 필요하지 않습니다.");
            notifyPrivacyOptionsAvailability();
            return;
        }
        UserMessagingPlatform.showPrivacyOptionsForm(this, formError -> {
            notifyPrivacyOptionsAvailability();
            initializeMobileAdsIfAllowed();
        });
    }

    private void enterImmersiveMode() {
        View decorView = getWindow().getDecorView();
        decorView.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        }
    }

    /* ---------- 하단 배너 ----------
       광고 단위 ID가 비어 있으면 배너를 만들지 않는다. 실제 단위를 넣기 전에 출시해도 앱은 그대로 돈다. */
    private void setupBannerAd() {
        if (bannerAdView != null || bannerContainer == null) return;
        if (BANNER_AD_UNIT_ID == null || BANNER_AD_UNIT_ID.isEmpty()) return;
        if (consentInformation == null || !consentInformation.canRequestAds()) return;

        AdView adView = new AdView(this);
        adView.setAdUnitId(BANNER_AD_UNIT_ID);
        adView.setAdSize(adaptiveBannerSize());
        adView.setAdListener(new com.google.android.gms.ads.AdListener() {
            @Override
            public void onAdLoaded() {
                bannerLoaded = true;
                applyBannerVisibility();
            }

            @Override
            public void onAdFailedToLoad(LoadAdError error) {
                // 못 불러온 배너는 빈 칸으로 남기지 않고 접는다.
                bannerLoaded = false;
                applyBannerVisibility();
            }
        });
        bannerAdView = adView;
        bannerContainer.addView(adView);
        adView.loadAd(new AdRequest.Builder().build());
    }

    private AdSize adaptiveBannerSize() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int widthDp = Math.max(320, (int) (metrics.widthPixels / metrics.density));
        return AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp);
    }

    private void setBannerVisible(boolean visible) {
        bannerWanted = visible;
        if (visible) setupBannerAd();   // 동의가 늦게 끝난 경우를 위해 여기서도 준비한다
        applyBannerVisibility();
    }

    private void applyBannerVisibility() {
        if (bannerContainer == null) return;
        boolean show = bannerWanted && bannerLoaded && bannerAdView != null;
        bannerContainer.setVisibility(show ? View.VISIBLE : View.GONE);
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
        if (consentInformation == null || !consentInformation.canRequestAds()) {
            sendAdMessage("광고 개인정보 확인이 끝난 뒤 보상형 광고를 이용할 수 있습니다.");
            return;
        }
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
                        if (error instanceof NoCredentialException) {
                            sendAccountMessage("사용할 수 있는 Google 계정을 찾지 못했습니다.");
                        } else {
                            sendAccountMessage("Google 로그인이 취소되었거나 완료되지 않았습니다.");
                        }
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
        fetchProfile();
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

    /* ---------- 명예의 전당 ----------
       게스트(익명)는 올리지 않는다. 닉네임으로 겨루는 자리라 계정을 연결한 사람만 쓴다.
       보안 규칙도 같은 조건이라, 여기서 막지 않아도 서버가 거절한다. */
    private boolean isLinkedUser() {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        return user != null && !user.isAnonymous();
    }

    private CollectionReference leaderboardCollection() {
        return firestore.collection("leaderboard");
    }

    private CollectionReference levelRankCollection(int level) {
        return firestore.collection("levelRanks").document(String.valueOf(level)).collection("entries");
    }

    private void sendLeaderboard(String payload) {
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.onOmokLeaderboard && window.onOmokLeaderboard(" + payload + ");", null);
    }

    private void sendProfile(String payload) {
        if (webView == null) return;
        webView.evaluateJavascript(
                "window.onOmokProfile && window.onOmokProfile(" + payload + ");", null);
    }

    // 내 랭킹 줄을 읽어 온다. 기기를 바꿔도 닉네임을 되찾을 수 있어야 한다.
    private void fetchProfile() {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        if (user == null || user.isAnonymous()) {
            sendProfile("{\"linked\":false,\"nickname\":\"\"}");
            return;
        }
        leaderboardCollection().document(user.getUid()).get().addOnCompleteListener(this, task -> {
            JSONObject out = new JSONObject();
            try {
                out.put("linked", true);
                String nickname = "";
                if (task.isSuccessful() && task.getResult() != null && task.getResult().exists()) {
                    Object raw = task.getResult().get("nickname");
                    if (raw != null) nickname = String.valueOf(raw);
                }
                out.put("nickname", nickname);
                out.put("ok", task.isSuccessful());
            } catch (Exception ignored) { }
            sendProfile(out.toString());
        });
    }

    /* 웹이 만들어 준 요약을 그대로 올린다.
       {nickname, maxLevel, clears, noItemClears, levels:{"7":{seconds,moves}, ...}} */
    private void publishProfile(String json) {
        FirebaseUser user = firebaseAuth.getCurrentUser();
        if (user == null || user.isAnonymous()) {
            sendAccountMessage("명예의 전당은 Google 계정을 연결한 뒤에 참여할 수 있습니다.");
            return;
        }
        JSONObject payload;
        try {
            payload = new JSONObject(json);
        } catch (Exception error) {
            sendAccountMessage("기록을 올리지 못했습니다.");
            return;
        }
        String nickname = payload.optString("nickname", "").trim();
        if (nickname.length() < 2 || nickname.length() > 12) {
            sendAccountMessage("닉네임은 2자 이상 12자 이하로 정해 주세요.");
            return;
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("nickname", nickname);
        summary.put("maxLevel", clampLevel(payload.optInt("maxLevel", 0)));
        summary.put("clears", clampLevel(payload.optInt("clears", 0)));
        summary.put("noItemClears", clampLevel(payload.optInt("noItemClears", 0)));
        summary.put("updatedAt", FieldValue.serverTimestamp());

        leaderboardCollection().document(user.getUid())
                .set(summary, SetOptions.merge())
                .addOnCompleteListener(this, task -> {
                    if (task.isSuccessful()) sendAccountMessage("명예의 전당에 기록을 올렸습니다.");
                    else sendAccountMessage("명예의 전당 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.");
                    fetchProfile();
                });

        // 단계별 최고 기록은 타임어택 순위에 따로 올린다.
        JSONObject levels = payload.optJSONObject("levels");
        if (levels == null) return;
        for (java.util.Iterator<String> it = levels.keys(); it.hasNext(); ) {
            String key = it.next();
            int level;
            try {
                level = Integer.parseInt(key);
            } catch (Exception error) {
                continue;
            }
            if (level < 1 || level > MAX_LEVEL) continue;
            JSONObject best = levels.optJSONObject(key);
            if (best == null) continue;
            double seconds = best.optDouble("seconds", 0);
            int moves = best.optInt("moves", 0);
            if (seconds <= 0 || moves < 5 || moves > 225) continue;

            Map<String, Object> row = new HashMap<>();
            row.put("nickname", nickname);
            row.put("seconds", seconds);
            row.put("moves", moves);
            row.put("updatedAt", FieldValue.serverTimestamp());
            levelRankCollection(level).document(user.getUid()).set(row, SetOptions.merge());
        }
    }

    private int clampLevel(int value) {
        if (value < 0) return 0;
        return Math.min(value, MAX_LEVEL);
    }

    /* kind = "level"  → 도달 단계 순위
       kind = "time"   → 해당 단계 타임어택 순위 */
    private void fetchLeaderboard(String kind, int level) {
        if (!isLinkedUser()) {
            sendLeaderboard("{\"ok\":false,\"reason\":\"guest\",\"kind\":"
                    + JSONObject.quote(kind == null ? "level" : kind) + ",\"rows\":[]}");
            return;
        }
        final String mode = "time".equals(kind) ? "time" : "level";
        final int wanted = Math.max(1, Math.min(level, MAX_LEVEL));
        Query query = "time".equals(mode)
                ? levelRankCollection(wanted).orderBy("seconds", Query.Direction.ASCENDING).limit(LEADERBOARD_LIMIT)
                : leaderboardCollection()
                        .orderBy("maxLevel", Query.Direction.DESCENDING)
                        .orderBy("clears", Query.Direction.DESCENDING)
                        .limit(LEADERBOARD_LIMIT);

        String myUid = firebaseAuth.getCurrentUser() == null ? "" : firebaseAuth.getCurrentUser().getUid();
        query.get().addOnCompleteListener(this, task -> {
            JSONObject out = new JSONObject();
            JSONArray rows = new JSONArray();
            try {
                out.put("kind", mode);
                out.put("level", wanted);
                out.put("ok", task.isSuccessful());
                if (!task.isSuccessful()) {
                    out.put("reason", "network");
                } else {
                    QuerySnapshot snapshot = task.getResult();
                    List<DocumentSnapshot> docs = snapshot == null
                            ? new ArrayList<>() : snapshot.getDocuments();
                    for (DocumentSnapshot doc : docs) {
                        JSONObject row = new JSONObject();
                        row.put("nickname", String.valueOf(doc.get("nickname")));
                        row.put("me", doc.getId().equals(myUid));
                        if ("time".equals(mode)) {
                            Object seconds = doc.get("seconds");
                            Object moves = doc.get("moves");
                            row.put("seconds", seconds instanceof Number ? ((Number) seconds).doubleValue() : 0);
                            row.put("moves", moves instanceof Number ? ((Number) moves).intValue() : 0);
                        } else {
                            Object maxLevel = doc.get("maxLevel");
                            Object clears = doc.get("clears");
                            Object noItem = doc.get("noItemClears");
                            row.put("maxLevel", maxLevel instanceof Number ? ((Number) maxLevel).intValue() : 0);
                            row.put("clears", clears instanceof Number ? ((Number) clears).intValue() : 0);
                            row.put("noItemClears", noItem instanceof Number ? ((Number) noItem).intValue() : 0);
                        }
                        rows.put(row);
                    }
                }
                out.put("rows", rows);
            } catch (Exception ignored) { }
            sendLeaderboard(out.toString());
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
        // 공개 순위에 남은 줄도 함께 지운다. 지우지 않으면 사라진 계정의 닉네임이 순위표에 남는다.
        leaderboardCollection().document(user.getUid()).delete();
        for (int level = 1; level <= MAX_LEVEL; level++) {
            levelRankCollection(level).document(user.getUid()).delete();
        }
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

        @JavascriptInterface
        public void showPrivacyOptions() {
            runOnUiThread(MainActivity.this::showPrivacyOptions);
        }

        @JavascriptInterface
        public void setBannerVisible(boolean visible) {
            runOnUiThread(() -> MainActivity.this.setBannerVisible(visible));
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
        public void publishProfile(String json) {
            runOnUiThread(() -> MainActivity.this.publishProfile(json));
        }

        @JavascriptInterface
        public void fetchProfile() {
            runOnUiThread(MainActivity.this::fetchProfile);
        }

        @JavascriptInterface
        public void fetchLeaderboard(String kind, int level) {
            runOnUiThread(() -> MainActivity.this.fetchLeaderboard(kind, level));
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

    private void handleSystemBack() {
        if (webView.getUrl() == null || !webView.getUrl().startsWith(GAME_URL)) {
            webView.loadUrl(GAME_URL);
            return;
        }
        webView.evaluateJavascript(
                "window.handleOmokAndroidBack ? window.handleOmokAndroidBack() : false",
                result -> {
                    if (!"true".equals(result)) showExitConfirmation();
                }
        );
    }

    private void showExitConfirmation() {
        if (isFinishing() || isDestroyed()) return;
        if (exitDialog != null && exitDialog.isShowing()) return;
        exitDialog = new AlertDialog.Builder(this)
                .setTitle("오목 챌린지")
                .setMessage("게임을 종료할까요?")
                .setNegativeButton("계속하기", null)
                .setPositiveButton("종료", (dialog, which) -> finish())
                .create();
        exitDialog.setOnDismissListener(dialog -> exitDialog = null);
        exitDialog.show();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.evaluateJavascript("window.pauseOmokGame && window.pauseOmokGame();", null);
        if (bannerAdView != null) bannerAdView.pause();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        webView.onResume();
        if (bannerAdView != null) bannerAdView.resume();
        webView.evaluateJavascript("window.resumeOmokGame && window.resumeOmokGame();", null);
    }

    @Override
    protected void onDestroy() {
        dismissJsConfirm();
        if (exitDialog != null) {
            exitDialog.dismiss();
            exitDialog = null;
        }
        if (bannerAdView != null) {
            bannerAdView.destroy();
            bannerAdView = null;
        }
        webView.removeJavascriptInterface("OmokAds");
        webView.removeJavascriptInterface("OmokAccount");
        webView.destroy();
        super.onDestroy();
    }
}
