package ctrl.mietze.veyrapacketlab;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.content.Context;
import android.graphics.Color;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.graphics.Insets;
import android.widget.FrameLayout;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Offline-first native Android host for Veyra PacketLab.
 * The simulator, topology engines and interface are bundled as app assets.
 * No network permissions, remote scripts or external content are required.
 */
public final class MainActivity extends Activity {
    private static final String TAG = "VeyraPacketLab";
    private static final int PICK_PROJECT = 8109;
    private static final int MAX_IMPORT_BYTES = 4 * 1024 * 1024;
    private WebView webView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(10, 8, 14));
        getWindow().setNavigationBarColor(Color.rgb(10, 8, 14));
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(10, 8, 14));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setBlockNetworkLoads(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setSupportZoom(false);
        webView.getSettings().setBuiltInZoomControls(false);
        webView.getSettings().setDisplayZoomControls(false);
        webView.getSettings().setDefaultTextEncodingName("UTF-8");
        webView.addJavascriptInterface(new NativeBridge(), "VeyraNative");
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.getUrl().toString().startsWith("file:///android_asset/");
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                Log.i(TAG, m.message() + " @" + m.sourceId() + ":" + m.lineNumber());
                return true;
            }
        });
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(10, 8, 14));
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets bars = insets.getInsets(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                root.setPadding(0, bars.top, 0, bars.bottom);
                return insets;
            });
        }
        setContentView(root);
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript("String(!!(window.VeyraBack && window.VeyraBack()))",
            value -> {
                if (!"\"true\"".equals(value)) MainActivity.super.onBackPressed();
            });
    }

    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("VeyraNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_PROJECT || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        try (InputStream in = getContentResolver().openInputStream(data.getData());
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IllegalStateException("Kann Datei nicht öffnen");
            byte[] buf = new byte[8192];
            int n, total = 0;
            while ((n = in.read(buf)) != -1) {
                total += n;
                if (total > MAX_IMPORT_BYTES) throw new IllegalArgumentException("Datei größer als 4 MB");
                out.write(buf, 0, n);
            }
            String dataBase64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
            if (webView != null) {
                webView.evaluateJavascript("window.VeyraProject.loadBase64('" + dataBase64 + "')", null);
            }
        } catch (Exception e) {
            Log.e(TAG, "Import", e);
            toast("Import nicht möglich: " + e.getMessage());
        }
    }

    private void toast(String text) {
        runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_SHORT).show());
    }

    private void saveDownload(String filename, String mimeType, byte[] bytes) {
        Uri uri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/VeyraPacketLab");
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("MediaStore verweigert Speicherung");
            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                if (os == null) throw new IllegalStateException("Speicherstream fehlt");
                os.write(bytes);
                os.flush();
            }
            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(uri, ready, null, null);
            toast("Gespeichert: Downloads/VeyraPacketLab/" + filename);
        } catch (Exception e) {
            Log.e(TAG, "Export", e);
            if (uri != null) getContentResolver().delete(uri, null, null);
            toast("Speichern fehlgeschlagen: " + e.getMessage());
        }
    }

    private static String timestamp() {
        return new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
    }

    public final class NativeBridge {
        @JavascriptInterface public void savePng(String dataUrl) {
            if (dataUrl == null || !dataUrl.startsWith("data:image/png;base64,") || dataUrl.length() > 24_000_000) {
                toast("Ungültiges PNG");
                return;
            }
            try {
                byte[] bytes = Base64.decode(dataUrl.substring("data:image/png;base64,".length()), Base64.DEFAULT);
                saveDownload("network-" + timestamp() + ".png", "image/png", bytes);
            } catch (Exception e) { toast("PNG-Export fehlgeschlagen"); }
        }

        @JavascriptInterface public void saveProject(String json) {
            if (json == null || json.length() > 4_000_000) { toast("Projekt zu groß"); return; }
            saveDownload("PacketLab-" + timestamp() + ".pklab", "application/json",
                json.getBytes(StandardCharsets.UTF_8));
        }

        @JavascriptInterface public void loadProject() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/octet-stream", "application/json", "text/plain", "application/x-pklab"});
                try { startActivityForResult(intent, PICK_PROJECT); }
                catch (ActivityNotFoundException e) { toast("Keine Dateiauswahl verfügbar"); }
            });
        }

        @JavascriptInterface public void vibrate(int ms) {
            if (ms < 1 || ms > 80) return;
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= 26)
                v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface public void notifyUser(String text) {
            toast(text == null ? "" : text.substring(0, Math.min(140, text.length())));
        }
    }
}
