# The JavaScript bridge is intentionally limited to local app assets.
-keepclassmembers class com.broodsky85.omokchallenge.MainActivity$AdsBridge {
    @android.webkit.JavascriptInterface <methods>;
}
