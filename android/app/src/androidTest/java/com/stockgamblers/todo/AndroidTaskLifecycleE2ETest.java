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
        captureStep("002-list-created.png");

        createTask("Lifecycle regular task");
        createTask("Lifecycle completed task");
        createTask("Lifecycle starred task");
        dismissKeyboard();
        waitFor(task("Lifecycle starred task"));
        captureStep("003-tasks-created.png");

        click(text("Star Lifecycle starred task"));
        waitFor(text("Unstar Lifecycle starred task"));
        click(text("Complete Lifecycle completed task"));
        waitUntilGone(task("Lifecycle completed task"));
        waitFor(text("Show Completed Items"));
        captureStep("004-task-states-changed.png");

        click(text("Show Completed Items"));
        waitFor(task("Lifecycle completed task"));
        waitFor(text("Hide Completed Items"));
        captureStep("005-completed-revealed-in-list.png");

        navigateTo("Starred");
        waitFor(task("Lifecycle starred task"));
        assertGone(task("Lifecycle regular task"));
        assertGone(task("Lifecycle completed task"));
        captureStep("006-starred-view.png");

        navigateTo("Completed");
        waitFor(task("Lifecycle completed task"));
        assertGone(task("Lifecycle starred task"));
        captureStep("007-completed-view.png");

        navigateTo("All");
        waitFor(task("Lifecycle starred task"));
        waitFor(task("Lifecycle regular task"));
        assertGone(task("Lifecycle completed task"));
        captureStep("008-all-view.png");
    }

    private void launchApp() {
        Intent launchIntent = targetContext.getPackageManager().getLaunchIntentForPackage(APP_PACKAGE);
        assertNotNull("The Todo launch intent must exist", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        targetContext.startActivity(launchIntent);
        assertTrue(
                "Todo did not become the foreground application",
                device.wait(Until.hasObject(By.pkg(APP_PACKAGE).depth(0)), UI_TIMEOUT_MS));
        waitFor(text("Sign In"));
    }

    private void createTask(String taskName) {
        UiObject2 taskInput = waitFor(input("New task"));
        setWebViewText(taskInput, taskName);
        device.click(device.getDisplayWidth() / 2, 73);
        device.waitForIdle();
        waitFor(task(taskName));
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
    }

    private void navigateTo(String destination) {
        openNavigation();
        click(text(destination));
        // A closed WebView drawer can remain in the accessibility tree. Tapping the fixed
        // scrim area closes it when visible and is a no-op on the empty page background.
        device.click(device.getDisplayWidth() - 20, device.getDisplayHeight() / 2);
        device.waitForIdle();
        waitForTopBarTitle(destination);
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

    private void waitUntilGone(BySelector selector) {
        assertTrue(
                "Timed out waiting for " + selector + " to disappear",
                device.wait(Until.gone(selector), UI_TIMEOUT_MS));
    }

    private void assertGone(BySelector selector) {
        assertTrue("Expected no object matching " + selector, !device.hasObject(selector));
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

    private BySelector task(String taskName) {
        return input("Task " + taskName);
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
        for (int index = 0; index < actualPixels.length; index++) {
            if (expectedPixels[index] != actualPixels[index]) {
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
                        + " pixels; tolerance is exactly 0",
                differentPixels == 0);
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
