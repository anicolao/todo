package com.stockgamblers.todo;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.util.regex.Pattern;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppLaunchE2ETest {
    private static final String APP_PACKAGE = "com.stockgamblers.todo";
    private static final long LAUNCH_TIMEOUT_MS = 30_000;

    @Test
    public void launchesCapacitorAppAndCapturesScreenshot() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(APP_PACKAGE);

        assertNotNull("The Todo launch intent must exist", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(launchIntent);

        assertTrue(
                "Todo did not become the foreground application",
                device.wait(Until.hasObject(By.pkg(APP_PACKAGE).depth(0)), LAUNCH_TIMEOUT_MS));

        UiObject2 signIn = device.wait(
                Until.findObject(By.text(Pattern.compile("sign in", Pattern.CASE_INSENSITIVE))),
                LAUNCH_TIMEOUT_MS);
        assertNotNull("The Capacitor WebView did not render the Sign In control", signIn);

        device.executeShellCommand("screencap -p /data/local/tmp/todo-app-launch.png");
        String captureResult =
                device.executeShellCommand("ls -l /data/local/tmp/todo-app-launch.png");
        assertTrue(
                "Could not retain the emulator screenshot: " + captureResult,
                captureResult.contains("todo-app-launch.png"));
    }
}
