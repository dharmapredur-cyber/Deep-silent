package com.silentdepth.game;

import android.content.res.AssetFileDescriptor;
import android.content.res.AssetManager;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.util.Log;
import android.webkit.JavascriptInterface;

import java.io.IOException;
import java.util.HashSet;
import java.util.Set;

public final class GameEffects {
    private final SoundPool pool;
    private final Set<Integer> ready = new HashSet<>();
    private final int bite;
    private final int death;
    private int biteStream;
    private int deathStream;
    private boolean foreground;
    private boolean muted;
    private boolean released;

    GameEffects(AssetManager assets) {
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        pool = new SoundPool.Builder().setAudioAttributes(attributes).setMaxStreams(3).build();
        pool.setOnLoadCompleteListener((soundPool, id, status) -> {
            synchronized (this) {
                if (status == 0 && !released) ready.add(id);
            }
        });
        bite = load(assets, "audio/bite.ogg");
        death = load(assets, "audio/death.ogg");
    }

    private int load(AssetManager assets, String file) {
        try (AssetFileDescriptor sound = assets.openFd(file)) {
            return pool.load(sound, 1);
        } catch (IOException exception) {
            Log.w("QuietDepthAudio", "Unable to load " + file, exception);
            return 0;
        }
    }

    @JavascriptInterface
    public synchronized boolean play(String effect) {
        final boolean isDeath = "death".equals(effect);
        if (!isDeath && !"bite".equals(effect)) return false;
        int sample = isDeath ? death : bite;
        if (released || !foreground || muted || !ready.contains(sample)) return false;
        float volume = isDeath ? .96f : .92f;
        int stream = pool.play(sample, volume, volume, isDeath ? 2 : 1, 0, 1f);
        if (isDeath) deathStream = stream;
        else biteStream = stream;
        return stream != 0;
    }

    @JavascriptInterface
    public synchronized void setMuted(boolean value) {
        muted = value;
        if (muted) stopStreams();
    }

    synchronized void setForeground(boolean value) {
        foreground = value;
        if (!foreground) stopStreams();
    }

    private void stopStreams() {
        if (released) return;
        if (biteStream != 0) pool.stop(biteStream);
        if (deathStream != 0) pool.stop(deathStream);
        biteStream = 0;
        deathStream = 0;
    }

    synchronized void release() {
        if (released) return;
        released = true;
        pool.release();
        ready.clear();
    }
}
