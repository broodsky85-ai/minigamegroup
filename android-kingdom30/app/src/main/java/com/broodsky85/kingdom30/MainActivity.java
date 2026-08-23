package com.broodsky85.kingdom30;

import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;

/**
 * 「멸망까지 30일」 WebView 껍데기.
 *
 * 게임은 kingdom30.html 파일 하나로 완결되고 기록은 localStorage에만 남는다.
 * 계정도, 광고도, 네트워크도 없다. 여기가 하는 일은 셋뿐이다 —
 * 자산에서 게임을 띄우고, 뒤로가기를 웹에 넘기고, 웹이 여는 다이얼로그를 실제로 보여준다.
 */
public class MainActivity extends ComponentActivity {

    private static final String GAME_URL = "file:///android_asset/web/kingdom30.html";

    private WebView webView;
    private AlertDialog activeDialog;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 카드를 오래 들여다보는 게임이라 화면이 꺼지면 흐름이 끊긴다.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterImmersiveMode();
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.game_web_view);
        configureWebView();
        webView.loadUrl(GAME_URL);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleSystemBack();
            }
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

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        // 기록(kingdom30-v1)이 여기에 남는다. 끄면 진행이 전부 날아간다.
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        // 게임 파일이 다른 로컬 파일을 읽을 이유가 없다. 둘 다 막아둔다.
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
        webView.setBackgroundColor(0xFF120D08);

        // 웹이 여는 alert / confirm / prompt는 WebView가 기본으로 삼킨다.
        // 도전장 복사가 마지막에 prompt로 떨어지므로 셋 다 실제 다이얼로그로 띄운다.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                dismissActiveDialog();
                activeDialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("확인", (d, w) -> result.confirm())
                        .setOnCancelListener(d -> result.cancel())
                        .create();
                activeDialog.show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                dismissActiveDialog();
                activeDialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("확인", (d, w) -> result.confirm())
                        .setNegativeButton("취소", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .create();
                activeDialog.show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                dismissActiveDialog();
                // 복사가 안 될 때 링크를 직접 골라 가져갈 수 있어야 하므로 입력란에 담아 보여준다.
                EditText field = new EditText(MainActivity.this);
                field.setText(defaultValue);
                field.setSelectAllOnFocus(true);
                activeDialog = new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(field)
                        .setPositiveButton("확인", (d, w) -> result.confirm(field.getText().toString()))
                        .setNegativeButton("취소", (d, w) -> result.cancel())
                        .setOnCancelListener(d -> result.cancel())
                        .create();
                activeDialog.show();
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                // 같은 게임 파일 안에서의 이동(시드 링크 포함)은 그대로 둔다.
                if (uri.toString().startsWith(GAME_URL)) return false;
                if ("file".equals(uri.getScheme())) {
                    view.loadUrl(GAME_URL);
                    return true;
                }
                // 도전장 링크 같은 바깥 주소는 브라우저에 넘긴다.
                if ("https".equals(uri.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!url.startsWith(GAME_URL)) view.loadUrl(GAME_URL);
            }
        });
    }

    /**
     * 뒤로가기는 먼저 웹에 물어본다. 도감이나 결말 화면이면 웹이 스스로 앞 화면으로 돌아가고,
     * 처리할 게 없다고 답하면(= 즉위 전이거나 재위 중이면) 종료할지 묻는다.
     * 진행 중인 판을 뒤로가기 한 번으로 조용히 버리지 않기 위해서다.
     */
    private void handleSystemBack() {
        String current = webView.getUrl();
        if (current == null || !current.startsWith(GAME_URL)) {
            webView.loadUrl(GAME_URL);
            return;
        }
        webView.evaluateJavascript(
                "window.handleKingdomAndroidBack ? window.handleKingdomAndroidBack() : false",
                result -> {
                    if (!"true".equals(result)) showExitConfirmation();
                }
        );
    }

    private void showExitConfirmation() {
        dismissActiveDialog();
        activeDialog = new AlertDialog.Builder(this)
                .setMessage("게임을 종료할까요?")
                .setPositiveButton("종료", (d, w) -> finish())
                .setNegativeButton("취소", null)
                .create();
        activeDialog.show();
    }

    private void dismissActiveDialog() {
        if (activeDialog != null && activeDialog.isShowing()) activeDialog.dismiss();
        activeDialog = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        enterImmersiveMode();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        dismissActiveDialog();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
