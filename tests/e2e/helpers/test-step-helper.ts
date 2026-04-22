import type { Page, TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

interface Verification {
  spec: string;
  check: () => Promise<void>;
}

interface StepOptions {
  description?: string;
  verifications?: Verification[];
}

export class TestStepHelper {
  private page: Page;
  private testInfo: TestInfo;
  private scenarioName: string = '';
  private scenarioDescription: string = '';
  private steps: { name: string; description: string; screenshot: string; verifications: string[] }[] = [];
  private stepCount: number = 0;

  constructor(page: Page, testInfo: TestInfo) {
    this.page = page;
    this.testInfo = testInfo;
  }

  setMetadata(name: string, description: string) {
    this.scenarioName = name;
    this.scenarioDescription = description;

    const specDir = path.dirname(this.testInfo.file);
    const screenshotDir = path.join(specDir, 'screenshots');
    const readmePath = path.join(specDir, 'README.md');

    if (fs.existsSync(screenshotDir)) {
      fs.rmSync(screenshotDir, { recursive: true, force: true });
    }
    if (fs.existsSync(readmePath)) {
      fs.rmSync(readmePath, { force: true });
    }
  }

  /**
   * Waits for all active CSS animations and transitions to finish.
   */
  async waitForAnimations() {
    await this.page.evaluate(async () => {
      const animations = document.getAnimations();
      await Promise.allSettled(animations.map(a => a.finished));
    });
  }

  /**
   * Performs an atomic test step: verifications, waiting for animations, and capturing a screenshot.
   */
  async step(name: string, options: StepOptions = {}) {
    this.stepCount++;
    const stepNumber = String(this.stepCount).padStart(3, '0');
    const safeName = name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const screenshotName = `${stepNumber}-${safeName}.png`;
    
    // Perform verifications
    const verificationResults: string[] = [];
    if (options.verifications) {
      for (const v of options.verifications) {
        await v.check();
        verificationResults.push(v.spec);
      }
    }

    await this.waitForAnimations();

    const specDir = path.dirname(this.testInfo.file);
    const screenshotDir = path.join(specDir, 'screenshots');
    
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const screenshotPath = path.join(screenshotDir, screenshotName);
    
    // We use fullPage: true to ensure we capture everything, as per the guide's philosophy.
    await this.page.screenshot({ path: screenshotPath, fullPage: true });

    this.steps.push({
      name,
      description: options.description || '',
      screenshot: `screenshots/${screenshotName}`,
      verifications: verificationResults
    });
  }

  /**
   * Generates a README.md file in the scenario directory documenting the steps and results.
   */
  async generateDocs() {
    const specDir = path.dirname(this.testInfo.file);
    const readmePath = path.join(specDir, 'README.md');

    let content = `# Scenario: ${this.scenarioName}\n\n`;
    content += `${this.scenarioDescription}\n\n`;
    content += `## Steps\n\n`;

    for (const step of this.steps) {
      content += `### Step ${String(this.steps.indexOf(step) + 1).padStart(3, '0')}: ${step.name}\n\n`;
      if (step.description) {
        content += `${step.description}\n\n`;
      }
      if (step.verifications.length > 0) {
        content += `**Verifications:**\n`;
        for (const v of step.verifications) {
          content += `- [x] ${v}\n`;
        }
        content += `\n`;
      }
      content += `![${step.name}](${step.screenshot})\n\n`;
    }

    fs.writeFileSync(readmePath, content);
  }
}
