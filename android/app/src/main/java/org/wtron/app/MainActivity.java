package org.wtron.app;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import androidx.browser.customtabs.CustomTabsIntent;

public final class MainActivity extends Activity {
    private static final String APP_URL = "https://wtron.org/app";
    private static final String WTRON_HOST = "wtron.org";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openWtron(resolveLaunchUri());
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openWtron(resolveLaunchUri());
    }

    private Uri resolveLaunchUri() {
        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data == null || data.getHost() == null) return Uri.parse(APP_URL);
        if (!WTRON_HOST.equalsIgnoreCase(data.getHost())) return Uri.parse(APP_URL);
        return data;
    }

    private void openWtron(Uri uri) {
        CustomTabsIntent intent = new CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setUrlBarHidingEnabled(true)
                .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                .setColorScheme(CustomTabsIntent.COLOR_SCHEME_DARK)
                .build();
        intent.launchUrl(this, uri);
        finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }
}
