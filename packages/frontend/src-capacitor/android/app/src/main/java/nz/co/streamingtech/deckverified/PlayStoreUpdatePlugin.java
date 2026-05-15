package nz.co.streamingtech.deckverified;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "PlayStoreUpdate")
public class PlayStoreUpdatePlugin extends Plugin {
    private static final String DEFAULT_APP_ID = "nz.co.streamingtech.deckverified";
    private static final String PLAY_STORE_PACKAGE = "com.android.vending";

    private AppUpdateManager appUpdateManager;

    @Override
    public void load() {
        appUpdateManager = AppUpdateManagerFactory.create(getContext());
    }

    @PluginMethod
    public void getUpdateAvailability(PluginCall call) {
        if (appUpdateManager == null) {
            call.reject("Play Store update manager is not available");
            return;
        }

        appUpdateManager.getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> call.resolve(buildUpdateAvailability(appUpdateInfo)))
            .addOnFailureListener(exception -> call.reject("Failed to check for Google Play updates", exception));
    }

    @PluginMethod
    public void openPlayStoreListing(PluginCall call) {
        String appId = call.getString("appId", DEFAULT_APP_ID);

        try {
            Intent playStoreIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + appId));
            playStoreIntent.setPackage(PLAY_STORE_PACKAGE);
            playStoreIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(playStoreIntent);
            call.resolve();
            return;
        } catch (ActivityNotFoundException ignored) {
            // Fallback to the browser below.
        }

        try {
            Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + appId));
            webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(webIntent);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Failed to open Play Store listing", exception);
        }
    }

    @NonNull
    private JSObject buildUpdateAvailability(AppUpdateInfo appUpdateInfo) {
        JSObject result = new JSObject();
        result.put("available", appUpdateInfo.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE);
        result.put("availableVersionCode", appUpdateInfo.availableVersionCode());
        result.put("immediateAllowed", appUpdateInfo.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
        result.put("updatePriority", appUpdateInfo.updatePriority());

        Integer stalenessDays = appUpdateInfo.clientVersionStalenessDays();
        if (stalenessDays != null) {
            result.put("stalenessDays", stalenessDays);
        }

        return result;
    }
}
