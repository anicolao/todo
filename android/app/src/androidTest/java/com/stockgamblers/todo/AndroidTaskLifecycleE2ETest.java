package com.stockgamblers.todo;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.StaleObjectException;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.regex.Pattern;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AndroidTaskLifecycleE2ETest {
    private static final String APP_PACKAGE = "com.stockgamblers.todo";
    private static final String BASELINE_DIRECTORY = "android-e2e";
    private static final String SHELL_OUTPUT_DIRECTORY =
            "/sdcard/Download/todo-android-e2e";
    private static final long UI_TIMEOUT_MS = 30_000;
    // WebView's x86_64 and arm64 rasterizers can disagree by one channel value
    // at a few antialiased glyph-edge pixels while rendering the same layout.
    private static final int MAX_CHANNEL_DELTA = 1;
    // Rounded edges and glyphs also produce isolated architecture-specific samples. Bound both
    // their extent and intensity so visible layout, icon, and color changes still fail.
    private static final int MAX_DIFFERENT_PIXELS = 256;
    private static final int MAX_OUTLIER_CHANNEL_DELTA = 40;

    private final Context targetContext =
            InstrumentationRegistry.getInstrumentation().getTargetContext();
    private final Context testContext = InstrumentationRegistry.getInstrumentation().getContext();
    private final UiDevice device =
            UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
    private File outputDirectory;
    private boolean updateScreenshots;

    @Before
    public void setUp() throws Exception {
        Bundle arguments = InstrumentationRegistry.getArguments();
        updateScreenshots = "true".equals(arguments.getString("updateScreenshots"));
        outputDirectory = new File(targetContext.getExternalFilesDir(null), BASELINE_DIRECTORY);
        assertTrue(
                "Could not create Android E2E output directory",
                outputDirectory.mkdirs() || outputDirectory.isDirectory());
        device.executeShellCommand("mkdir -p " + SHELL_OUTPUT_DIRECTORY);
    }

    @Test
    public void taskLifecycleMatchesPixelBaselines() throws Exception {
        launchApp();
        click(text("Sign In"));
        waitFor(text("Open navigation menu"));
        waitForTopBarTitle("Profile");
        captureStep("001-signed-in.png");

        openNavigation();
        UiObject2 newList = waitFor(input("New list"));
        setWebViewText(newList, "Lifecycle List");
        pressImeEnter();
        waitFor(input("New task"));
        dismissKeyboard();
        waitForTopBarTitle("Lifecycle List");
        waitForNavigationClosed();
        captureStep("002-list-created.png");

        createTask("Lifecycle regular task");
        createTask("Lifecycle completed task");
        createTask("Lifecycle starred task");
        dismissKeyboard();
        captureStep("003-tasks-created.png");

        // The Android WebView accessibility bridge can keep the task subtree from before a
        // drawer transform even while the DOM accessibility tree and rendered pixels are current.
        // This is a fixed-size pixel test, so operate the row controls at their baseline geometry;
        // the screenshots below remain the assertions for both the actions and resulting state.
        device.click(372, 187);
        device.click(17, 227);
        SystemClock.sleep(500);
        captureStep("004-task-states-changed.png");

        device.click(device.getDisplayWidth() / 2, 280);
        SystemClock.sleep(500);
        captureStep("005-completed-revealed-in-list.png");

        navigateTo("Starred");
        waitForTopBarTitle("Starred");
        captureStep("006-starred-view.png");

        navigateTo("Completed");
        waitForTopBarTitle("Completed");
        captureStep("007-completed-view.png");

        navigateTo("All");
        waitForTopBarTitle("All");
        captureStep("008-all-view.png");
    }

    private void launchApp() {
        Intent launchIntent = targetContext.getPackageManager().getLaunchIntentForPackage(APP_PACKAGE);
        assertNotNull("The Todo launch intent must exist", launchIntent);
        launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TASK
                        | Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        for (int attempt = 0; attempt < 2; attempt++) {
            targetContext.startActivity(launchIntent);
            if (device.wait(Until.hasObject(By.pkg(APP_PACKAGE).depth(0)), UI_TIMEOUT_MS)) {
                waitFor(text("Sign In"));
                return;
            }
            device.pressHome();
            SystemClock.sleep(1_000);
        }
        assertTrue(
                "Todo did not become the foreground application",
                device.hasObject(By.pkg(APP_PACKAGE).depth(0)));
    }

    private void createTask(String taskName) {
        UiObject2 taskInput = waitFor(input("New task"));
        setWebViewText(taskInput, taskName);
        device.click(device.getDisplayWidth() / 2, 73);
        device.waitForIdle();
        SystemClock.sleep(500);
    }

    private void setWebViewText(UiObject2 input, String value) {
        input.click();
        input.setText(value);
        // Accessibility text replacement returns before WebView has necessarily delivered
        // its JavaScript input event. Let Svelte receive the bound value before submitting.
        SystemClock.sleep(500);
    }

    private void openNavigation() {
        UiObject2 menuButton = device.findObject(text("Open navigation menu"));
        if (menuButton == null) {
            // WebView can omit icon-only buttons from its accessibility tree. The visual test
            // uses a fixed 393x852 device, so the navigation control has a deterministic point.
            device.click(28, 73);
        } else {
            menuButton.click();
        }
        device.waitForIdle();
        waitFor(input("New list"));
        // The input becomes discoverable before the drawer's CSS entrance finishes. Clicking a
        // destination during that entrance can leave SMUI's visual open state behind even though
        // the route changed, so wait for the 280 ms mobile transition to settle first.
        SystemClock.sleep(350);
    }

    private void navigateTo(String destination) {
        openNavigation();
        selectOpenNavigationDestination(destination);
    }

    private void selectOpenNavigationDestination(String destination) {
        BySelector selector = text(destination);
        waitFor(selector);
        UiObject2 drawerRow = null;
        for (UiObject2 candidate : device.findObjects(selector)) {
            try {
                // The route title may have the same text behind the full-screen drawer. Drawer
                // labels start near the leading edge, while top-bar titles start after the icons.
                if (candidate.getVisibleBounds().left < 100) {
                    drawerRow = candidate;
                    break;
                }
            } catch (StaleObjectException ignored) {
                // Retry candidates below if the WebView replaced this accessibility node.
            }
        }
        assertNotNull("Could not find open navigation row " + destination, drawerRow);
        Rect rowLabelBounds = drawerRow.getVisibleBounds();
        // List navigation listens for pointerup so a real tap can be distinguished from dragging.
        // UiObject2.click() may invoke only the WebView accessibility click action; tapping the
        // row at the label's vertical center delivers the pointer sequence used by the product.
        device.click(device.getDisplayWidth() / 2, rowLabelBounds.centerY());
        device.waitForIdle();
        // Selecting a destination closes the full-width portrait drawer. There is no longer a
        // stable scrim coordinate to tap: the drawer intentionally owns the whole viewport.
        waitForNavigationClosed();
    }

    private void waitForNavigationClosed() {
        // Route content and its title become accessible behind the drawer before the coordinated
        // drawer/list animation completes. WebView keeps the translated-offscreen drawer in its
        // accessibility tree with its old bounds, so neither Until.gone() nor geometry can signal
        // completion. Wait for the product's fixed 280 ms transition, then let native work settle.
        SystemClock.sleep(350);
        device.waitForIdle();
    }

    private void dismissKeyboard() {
        if (device.hasObject(By.pkg("com.google.android.inputmethod.latin"))) {
            device.pressBack();
            device.waitForIdle();
        }
    }

    private void pressImeEnter() {
        device.pressEnter();
        device.waitForIdle();
    }

    private UiObject2 waitFor(BySelector selector) {
        UiObject2 object = device.wait(Until.findObject(selector), UI_TIMEOUT_MS);
        if (object == null) {
            try {
                File hierarchy = new File(outputDirectory, "window-hierarchy.xml");
                device.dumpWindowHierarchy(hierarchy);
                copyForHost(hierarchy);
                device.executeShellCommand(
                        "screencap -p " + SHELL_OUTPUT_DIRECTORY + "/selector-failure.png");
            } catch (Exception ignored) {
                // Preserve the original selector failure when diagnostics cannot be captured.
            }
        }
        assertNotNull("Timed out waiting for " + selector, object);
        return object;
    }

    private void waitForTopBarTitle(String title) {
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        long stableSince = -1;
        BySelector selector = text(title);
        while (SystemClock.uptimeMillis() < deadline) {
            boolean visibleInTopBar = false;
            for (UiObject2 candidate : device.findObjects(selector)) {
                try {
                    Rect bounds = candidate.getVisibleBounds();
                    if (bounds.top < 110 && bounds.left >= 100) {
                        visibleInTopBar = true;
                        break;
                    }
                } catch (StaleObjectException ignored) {
                    // Svelte may replace the title node between query and bounds lookup.
                }
            }
            if (visibleInTopBar) {
                if (stableSince < 0) {
                    stableSince = SystemClock.uptimeMillis();
                } else if (SystemClock.uptimeMillis() - stableSince >= 500) {
                    return;
                }
            } else {
                stableSince = -1;
            }
            SystemClock.sleep(100);
        }
        waitFor(selector);
        fail("Timed out waiting for top app bar title " + title);
    }

    private void click(BySelector selector) {
        waitFor(selector).click();
        device.waitForIdle();
    }

    private BySelector text(String value) {
        return By.text(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
    }

    private BySelector input(String value) {
        return By.hint(Pattern.compile(Pattern.quote(value), Pattern.CASE_INSENSITIVE));
    }

    private void captureStep(String screenshotName) throws Exception {
        // Remove transient focus styling from whichever control performed the last action.
        // The fixed top-app-bar point is non-interactive on every route in this scenario.
        device.click(device.getDisplayWidth() / 2, 73);
        device.waitForIdle();
        Bitmap actual = waitForStableScreenshot();

        File actualFile = new File(outputDirectory, screenshotName);
        writePng(actual, actualFile);
        copyForHost(actualFile);
        if (updateScreenshots) {
            actual.recycle();
            return;
        }

        Bitmap expected;
        try (InputStream stream =
                testContext.getAssets().open(BASELINE_DIRECTORY + "/" + screenshotName)) {
            expected = BitmapFactory.decodeStream(stream);
        } catch (Exception exception) {
            actual.recycle();
            fail("Missing Android pixel baseline " + screenshotName
                    + "; run npm run android:test:emulator -- --update-screenshots");
            return;
        }
        assertNotNull("Could not decode Android pixel baseline " + screenshotName, expected);

        if (expected.getWidth() != actual.getWidth()
                || expected.getHeight() != actual.getHeight()) {
            int expectedWidth = expected.getWidth();
            int expectedHeight = expected.getHeight();
            int actualWidth = actual.getWidth();
            int actualHeight = actual.getHeight();
            expected.recycle();
            actual.recycle();
            fail("Screenshot dimensions changed for " + screenshotName + ": expected "
                    + expectedWidth + "x" + expectedHeight + ", actual "
                    + actualWidth + "x" + actualHeight);
        }

        int width = actual.getWidth();
        int height = actual.getHeight();
        int[] expectedPixels = new int[width * height];
        int[] actualPixels = new int[width * height];
        int[] diffPixels = new int[width * height];
        expected.getPixels(expectedPixels, 0, width, 0, 0, width, height);
        actual.getPixels(actualPixels, 0, width, 0, 0, width, height);

        int differentPixels = 0;
        int largestChannelDelta = 0;
        for (int index = 0; index < actualPixels.length; index++) {
            largestChannelDelta = Math.max(
                    largestChannelDelta,
                    pixelChannelDelta(expectedPixels[index], actualPixels[index]));
            if (pixelsDiffer(expectedPixels[index], actualPixels[index])) {
                differentPixels++;
                diffPixels[index] = Color.MAGENTA;
            } else {
                diffPixels[index] = Color.TRANSPARENT;
            }
        }

        if (differentPixels > 0) {
            Bitmap diff = Bitmap.createBitmap(diffPixels, width, height, Bitmap.Config.ARGB_8888);
            File diffFile = new File(
                    outputDirectory, screenshotName.replace(".png", ".diff.png"));
            writePng(diff, diffFile);
            copyForHost(diffFile);
            diff.recycle();
        }
        expected.recycle();
        actual.recycle();
        assertTrue(
                screenshotName + " differs from its baseline by " + differentPixels
                        + " pixels; tolerance is " + MAX_DIFFERENT_PIXELS
                        + " pixels after a per-channel tolerance of " + MAX_CHANNEL_DELTA
                        + ", and largest channel delta is " + largestChannelDelta
                        + " with tolerance " + MAX_OUTLIER_CHANNEL_DELTA,
                differentPixels <= MAX_DIFFERENT_PIXELS
                        && largestChannelDelta <= MAX_OUTLIER_CHANNEL_DELTA);
    }

    private boolean pixelsDiffer(int expected, int actual) {
        return pixelChannelDelta(expected, actual) > MAX_CHANNEL_DELTA;
    }

    private int pixelChannelDelta(int expected, int actual) {
        return Math.max(
                Math.max(
                        Math.abs(Color.alpha(expected) - Color.alpha(actual)),
                        Math.abs(Color.red(expected) - Color.red(actual))),
                Math.max(
                        Math.abs(Color.green(expected) - Color.green(actual)),
                        Math.abs(Color.blue(expected) - Color.blue(actual))));
    }

    private Bitmap waitForStableScreenshot() {
        long deadline = SystemClock.uptimeMillis() + UI_TIMEOUT_MS;
        Bitmap previous = null;
        int identicalComparisons = 0;
        while (SystemClock.uptimeMillis() < deadline) {
            Bitmap current = takeWebViewScreenshot();
            if (previous != null && previous.sameAs(current)) {
                identicalComparisons++;
                previous.recycle();
                if (identicalComparisons >= 2) {
                    return current;
                }
            } else {
                identicalComparisons = 0;
                if (previous != null) {
                    previous.recycle();
                }
            }
            previous = current;
            SystemClock.sleep(150);
        }
        if (previous != null) {
            previous.recycle();
        }
        fail("WebView did not become pixel-stable before screenshot capture");
        return null;
    }

    private Bitmap takeWebViewScreenshot() {
        Bitmap fullScreenshot =
                InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull("Android did not return a screenshot", fullScreenshot);

        UiObject2 webView = waitFor(By.clazz("android.webkit.WebView").pkg(APP_PACKAGE));
        Rect bounds = webView.getVisibleBounds();
        Bitmap webViewScreenshot = Bitmap.createBitmap(
                fullScreenshot, bounds.left, bounds.top, bounds.width(), bounds.height());
        fullScreenshot.recycle();
        return webViewScreenshot;
    }

    private void writePng(Bitmap bitmap, File destination) throws Exception {
        try (FileOutputStream output = new FileOutputStream(destination)) {
            assertTrue(
                    "Could not encode " + destination,
                    bitmap.compress(Bitmap.CompressFormat.PNG, 100, output));
        }
    }

    private void copyForHost(File source) throws Exception {
        device.executeShellCommand(
                "cp " + source.getAbsolutePath() + " " + SHELL_OUTPUT_DIRECTORY + "/"
                        + source.getName());
    }

}
