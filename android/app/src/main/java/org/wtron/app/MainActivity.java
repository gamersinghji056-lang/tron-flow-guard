package org.wtron.app;

import android.app.Activity;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Insets;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.widget.FrameLayout;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://wtron.org/app";
    private static final String WTRON_HOST = "wtron.org";
    private static final int FILE_CHOOSER_REQUEST_CODE = 1001;
    private static final int CAMERA_PERMISSION_REQUEST_CODE = 1002;

    private WebView webView;
    private FrameLayout rootView;
    private ValueCallback<Uri[]> filePathCallback;
    private PermissionRequest pendingCameraPermissionRequest;
    private int systemBarTopInsetPx = 0;
    private int systemBarBottomInsetPx = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        configureSystemBars();
        rootView = new FrameLayout(this);
        rootView.setBackgroundColor(Color.rgb(5, 5, 5));
        webView = createWebView();
        rootView.addView(webView);
        bindSystemInsets(rootView);
        setContentView(rootView);
        rootView.requestApplyInsets();
        webView.loadUrl(resolveLaunchUri().toString());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) {
            webView.loadUrl(resolveLaunchUri().toString());
        }
    }

    private Uri resolveLaunchUri() {
        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data == null || data.getHost() == null) return Uri.parse(APP_URL);
        if (!isWtronAppUri(data)) return Uri.parse(APP_URL);
        return data;
    }

    private boolean isWtronAppUri(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && WTRON_HOST.equalsIgnoreCase(uri.getHost());
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));
        view.setBackgroundColor(Color.rgb(5, 5, 5));

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setTextZoom(100);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(view, true);

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isWtronAppUri(uri)) {
                    return false;
                }
                openExternal(uri);
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectAndroidAppEnvironment(view, 0, 0);
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (request == null) return;
                    if (!hasCameraResource(request.getResources())) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                        return;
                    }
                    pendingCameraPermissionRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST_CODE);
                });
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER_REQUEST_CODE);
                    return true;
                } catch (ActivityNotFoundException error) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
            }
        });
        return view;
    }

    private void bindSystemInsets(FrameLayout root) {
        root.setOnApplyWindowInsetsListener((target, insets) -> {
            int top = 0;
            int bottom = 0;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Insets systemBars = insets.getInsets(WindowInsets.Type.systemBars());
                top = systemBars.top;
                bottom = systemBars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            systemBarTopInsetPx = top;
            systemBarBottomInsetPx = bottom;
            target.setPadding(0, top, 0, bottom);
            injectAndroidAppEnvironment(webView, 0, 0);
            return insets;
        });
    }

    private void injectAndroidAppEnvironment(WebView view, int topInsetPx, int bottomInsetPx) {
        String script = "(function(){"
                + "document.documentElement.classList.add('wtron-android-webview');"
                + "document.body&&document.body.classList.add('wtron-android-webview');"
                + "document.documentElement.style.setProperty('--wtron-android-safe-top','" + topInsetPx + "px');"
                + "document.documentElement.style.setProperty('--wtron-android-safe-bottom','" + bottomInsetPx + "px');"
                + "document.documentElement.style.setProperty('--wtron-app-platform','android');"
                + "})();";
        view.evaluateJavascript(script, null);
    }

    private boolean hasCameraResource(String[] resources) {
        if (resources == null) return false;
        for (String resource : resources) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                return true;
            }
        }
        return false;
    }

    private void openExternal(Uri uri) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(intent);
        } catch (ActivityNotFoundException ignored) {
            // Leave the current WTRON session in place if Android has no handler for the URI.
        }
    }

    private void configureSystemBars() {
        getWindow().setStatusBarColor(Color.rgb(5, 5, 5));
        getWindow().setNavigationBarColor(Color.rgb(5, 5, 5));
        getWindow().getDecorView().setSystemUiVisibility(0);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST_CODE || filePathCallback == null) return;
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != CAMERA_PERMISSION_REQUEST_CODE || pendingCameraPermissionRequest == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            pendingCameraPermissionRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingCameraPermissionRequest.deny();
        }
        pendingCameraPermissionRequest = null;
    }

    @Override
    protected void onDestroy() {
        if (pendingCameraPermissionRequest != null) {
            pendingCameraPermissionRequest.deny();
            pendingCameraPermissionRequest = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
