package ctrl.mietze.veyrapacketlab;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.LinkProperties;
import android.net.LinkAddress;
import android.net.RouteInfo;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.ScanResult;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.Set;
import java.util.List;
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
    private static final int PERMISSION_NETWORK = 8110;
    private boolean networkScanPending = false;
    private final Handler uiHandler = new Handler(Looper.getMainLooper());
    private final List<NsdManager.DiscoveryListener> discoveryListeners = new ArrayList<>();
    private static final int MAX_IMPORT_BYTES = 8 * 1024 * 1024;
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

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code != PERMISSION_NETWORK || !networkScanPending) return;
        networkScanPending = false;
        boolean allowed = grants.length != 0;
        for (int grant : grants) if (grant != PackageManager.PERMISSION_GRANTED) allowed = false;
        if (allowed) beginNetworkSnapshot();
        else deliverNetworkDiscovery("{\"error\":\"Standort- und WLAN-Berechtigung wurden nicht erteilt. Kein Scan wurde durchgeführt.\"}");
    }

    private void deliverNetworkDiscovery(String json) {
        runOnUiThread(() -> {
            if (webView != null) {
                webView.evaluateJavascript("window.PacketLabV09Discovery && PacketLabV09Discovery.receive(" + json + ")", null);
            }
        });
    }

    private void beginNetworkSnapshot() {
        runOnUiThread(() -> {
            JSONObject report = new JSONObject();
            JSONArray wifiNetworks = new JSONArray();
            LinkedHashMap<String, JSONObject> foundServices = new LinkedHashMap<>();
            NsdManager nsd = (NsdManager)getSystemService(Context.NSD_SERVICE);
            try {
                ConnectivityManager net = (ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
                Network network = net == null ? null : net.getActiveNetwork();
                NetworkCapabilities cap = network == null ? null : net.getNetworkCapabilities(network);
                if (cap == null || !cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                    report.put("error", "Mit einem WLAN verbinden, um das eigene Netz zu untersuchen.");
                    deliverNetworkDiscovery(report.toString());return;
                }
                LinkProperties links = net.getLinkProperties(network);
                JSONObject connection = new JSONObject();
                if (links != null) {
                    for (LinkAddress a : links.getLinkAddresses()) {
                        if (a.getAddress() instanceof Inet4Address) {
                            connection.put("ipv4", a.getAddress().getHostAddress());
                            connection.put("prefix", a.getPrefixLength());
                            break;
                        }
                    }
                    for (RouteInfo route : links.getRoutes()) {
                        if (route.isDefaultRoute() && route.getGateway() instanceof Inet4Address) {
                            connection.put("gateway", route.getGateway().getHostAddress());break;
                        }
                    }
                    JSONArray dns = new JSONArray();
                    for (InetAddress addr : links.getDnsServers()) dns.put(addr.getHostAddress());
                    connection.put("dns", dns);
                    connection.put("interface", links.getInterfaceName());
                }
                WifiManager manager=(WifiManager)getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if(manager!=null){
                    WifiInfo info=manager.getConnectionInfo();
                    if(info!=null){
                        connection.put("ssid", info.getSSID()==null?"":info.getSSID().replace("\"", ""));
                        connection.put("rssi", info.getRssi());
                    }
                    try {
                        manager.startScan(); // OS may rate-limit; cached authorized results are then used.
                        List<ScanResult> results=manager.getScanResults();
                        if(results!=null){
                            Set<String> listed = new HashSet<>();
                            for(ScanResult result:results){
                                if(wifiNetworks.length()>=35)break;
                                String ssid=result.SSID==null?"":result.SSID.trim();
                                if(ssid.isEmpty()||!listed.add(ssid+"_"+result.BSSID))continue;
                                JSONObject entry=new JSONObject();
                                entry.put("ssid",ssid);
                                entry.put("rssi",result.level);
                                entry.put("frequencyMhz",result.frequency);
                                entry.put("bssid",result.BSSID);
                                wifiNetworks.put(entry);
                            }
                        }
                    } catch(SecurityException se) {
                        report.put("wifiNotice","Umgebungs-WLANs benötigen aktivierte Ortungsdienste.");
                    }
                }
                report.put("connection",connection);
            }catch(Exception err) {
                try{report.put("error","Netzwerkauskunft: "+err.getMessage());}catch(Exception ignored){}
                deliverNetworkDiscovery(report.toString());return;
            }
            if(nsd!=null){
                String[] types={"_http._tcp.","_printer._tcp.","_ssh._tcp."};
                for(String type:types){
                    NsdManager.DiscoveryListener listener=new NsdManager.DiscoveryListener(){
                        @Override public void onDiscoveryStarted(String serviceType){}
                        @Override public void onServiceFound(NsdServiceInfo service){
                            if(foundServices.size()>=35)return;
                            try{
                                nsd.resolveService(service,new NsdManager.ResolveListener(){
                                    @Override public void onResolveFailed(NsdServiceInfo info,int errorCode){}
                                    @Override public void onServiceResolved(NsdServiceInfo info){
                                        try{
                                            InetAddress host=info.getHost();
                                            if(host==null)return;
                                            JSONObject item=new JSONObject();
                                            item.put("name",info.getServiceName().substring(0,Math.min(85,info.getServiceName().length())));
                                            item.put("type",info.getServiceType());
                                            item.put("ip",host.getHostAddress());
                                            item.put("port",info.getPort());
                                            foundServices.put(item.optString("name")+item.optString("ip"),item);
                                        }catch(Exception ignored){}
                                    }
                                });
                            }catch(Exception ignored){}
                        }
                        @Override public void onServiceLost(NsdServiceInfo info){}
                        @Override public void onDiscoveryStopped(String serviceType){}
                        @Override public void onStartDiscoveryFailed(String serviceType,int error){try{nsd.stopServiceDiscovery(this);}catch(Exception ignored){}}
                        @Override public void onStopDiscoveryFailed(String serviceType,int error){}
                    };
                    try{nsd.discoverServices(type,NsdManager.PROTOCOL_DNS_SD,listener);
                        discoveryListeners.add(listener);}catch(Exception ignored){}
                }
            }
            uiHandler.postDelayed(() -> {
                for(NsdManager.DiscoveryListener l:discoveryListeners){
                    try{nsd.stopServiceDiscovery(l);}catch(Exception ignored){}
                }
                discoveryListeners.clear();
                try{
                    JSONArray services=new JSONArray();
                    for(JSONObject item:foundServices.values())services.put(item);
                    report.put("services",services);
                    report.put("wifi",wifiNetworks);
                    report.put("method","Aktive WLAN-Verbindungsdaten, WLAN-Ergebnisliste und passives mDNS. Keine Port- oder Subnetz-Sweeps.");
                    deliverNetworkDiscovery(report.toString());
                }catch(Exception e){deliverNetworkDiscovery("{\"error\":\"Ergebnisse konnten nicht verarbeitet werden.\"}");}
            },7000);
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
        @JavascriptInterface public void saveNamedFile(String filename,String mime,String data) {
            if(filename == null || mime == null || data == null ||
                data.length()>8_000_000 ||
                !filename.matches("[A-Za-z0-9._-]{1,80}\\.(pklab|worklab|json)") ||
                !mime.equals("application/json")) {
                toast("Dateiname oder Dateiformat ungültig");return;
            }
            saveDownload(filename, mime, data.getBytes(StandardCharsets.UTF_8));
        }
        @JavascriptInterface public void requestNetworkSnapshot() {
            runOnUiThread(() -> {
                if(networkScanPending)return;
                if(Build.VERSION.SDK_INT>=33){
                    if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED ||
                        checkSelfPermission(Manifest.permission.NEARBY_WIFI_DEVICES)!=PackageManager.PERMISSION_GRANTED){
                        networkScanPending=true;
                        requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                           Manifest.permission.NEARBY_WIFI_DEVICES},PERMISSION_NETWORK);
                        return;
                    }
                } else if(Build.VERSION.SDK_INT>=23 &&
                    checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
                    networkScanPending=true;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},PERMISSION_NETWORK);
                    return;
                }
                beginNetworkSnapshot();
            });
        }
        @JavascriptInterface public void finishApp() {
            runOnUiThread(() -> MainActivity.this.finish());
        }
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
