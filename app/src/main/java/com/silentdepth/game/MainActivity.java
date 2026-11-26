package com.silentdepth.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

public final class MainActivity extends Activity {
    private static final String ENTRY = "file:///android_asset/index.html";
    private WebView game;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        game = new WebView(this);
        game.setBackgroundColor(Color.rgb(7, 26, 36));
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        game.getSettings().setJavaScriptEnabled(true);
        game.getSettings().setDomStorageEnabled(true);
        game.getSettings().setAllowContentAccess(false);
        game.getSettings().setAllowFileAccess(false);
        game.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                return !ENTRY.equals(url.toString());
            }
        });
        setContentView(game);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::gameBack
            );
        }
        immersive();
        game.loadUrl(ENTRY);
    }

    @Override
    public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive();
    }

    @SuppressWarnings("deprecation")
    private void immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            );
        }
    }

    @Override
    protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("window.pauseDive && window.pauseDive()", null);
            game.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (game != null) game.onResume();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        gameBack();
    }

    private void gameBack() {
        if (game != null) {
            game.evaluateJavascript("window.gameBack ? window.gameBack() : false", handled -> {
                if ("false".equals(handled)) finish();
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (game != null) {
            game.destroy();
            game = null;
        }
        super.onDestroy();
    }
}
