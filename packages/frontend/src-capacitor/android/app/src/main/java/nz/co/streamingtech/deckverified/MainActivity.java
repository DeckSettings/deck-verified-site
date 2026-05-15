package nz.co.streamingtech.deckverified;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String OFFICIAL_ANDROID_APP_MARKER = "DeckVerifiedAndroidApp";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayStoreUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) {
            return;
        }

        WebSettings settings = webView.getSettings();
        String baseUserAgent = settings.getUserAgentString();
        if (baseUserAgent == null || baseUserAgent.contains(OFFICIAL_ANDROID_APP_MARKER)) {
            return;
        }

        settings.setUserAgentString(baseUserAgent + " " + OFFICIAL_ANDROID_APP_MARKER + "/" + BuildConfig.VERSION_NAME);
    }
}
