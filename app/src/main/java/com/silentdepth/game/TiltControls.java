package com.silentdepth.game;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.Display;
import android.view.Surface;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

public final class TiltControls implements SensorEventListener {
    private final WebView view;
    private final SensorManager sensors;
    private final Sensor sensor;
    private boolean enabled;
    private boolean foreground;
    private boolean listening;
    private long lastSample;

    TiltControls(WebView view) {
        this.view = view;
        sensors = (SensorManager) view.getContext().getSystemService(Context.SENSOR_SERVICE);
        Sensor gravity = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_GRAVITY);
        sensor = gravity != null || sensors == null ? gravity : sensors.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return sensor != null;
    }

    @JavascriptInterface
    public void setEnabled(boolean active) {
        view.post(() -> {
            enabled = active;
            updateListener();
        });
    }

    void setForeground(boolean active) {
        foreground = active;
        updateListener();
    }

    private void updateListener() {
        if (enabled && foreground && sensor != null) {
            if (!listening) {
                lastSample = 0;
                listening = sensors.registerListener(this, sensor, SensorManager.SENSOR_DELAY_GAME);
            }
        } else if (listening) {
            sensors.unregisterListener(this);
            listening = false;
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (!listening || event.timestamp - lastSample < 30_000_000L) return;
        lastSample = event.timestamp;
        float x = event.values[0];
        float y = event.values[1];
        float normal = event.values[2];
        if (!Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(normal)) return;

        Display display = view.getDisplay();
        int rotation = display == null ? Surface.ROTATION_0 : display.getRotation();
        float right;
        float down;
        // The sensor axes follow the device's natural orientation, regardless of the display rotation.
        switch (rotation) {
            case Surface.ROTATION_90:
                right = y;
                down = x;
                break;
            case Surface.ROTATION_180:
                right = x;
                down = -y;
                break;
            case Surface.ROTATION_270:
                right = -y;
                down = -x;
                break;
            default:
                right = -x;
                down = y;
                break;
        }
        view.evaluateJavascript(
            "window.receiveDeviceTilt && window.receiveDeviceTilt("
                + right + "," + down + "," + normal + "," + rotation + ")",
            null
        );
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}
}
