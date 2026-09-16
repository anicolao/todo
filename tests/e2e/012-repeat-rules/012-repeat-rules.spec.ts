import { expect, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';
import {
	startTask,
	chooseDate,
	chooseRepeat,
	openDetails,
	saveDetails
} from '../helpers/task-details';

test.use({ actionTimeout: 10000 });

test('every repeat rule previews and completes consistently', async ({
	page,
	request
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(request);
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Repeat rules and completion',
		'All supported rules, month-end and leap-year overflow, weekdays, and early/late completion use the same schedule.'
	);
	await startTask(page, 'Repeat rules');
	const cases = [
		{
			type: 'Daily',
			every: '3',
			date: '2026-09-18',
			next: 'Mon, Sep 21, 2026',
			summary: 'Every 3 days'
		},
		{
			type: 'Weekly',
			every: '2',
			date: '2026-09-18',
			next: 'Fri, Oct 2, 2026',
			summary: 'Every 2 weeks on Friday'
		},
		{
			type: 'Monthly',
			every: '1',
			date: '2027-01-31',
			next: 'Wed, Mar 3, 2027',
			summary: 'Every month on day 31'
		},
		{
			type: 'Yearly',
			every: '1',
			date: '2028-02-29',
			next: 'Thu, Mar 1, 2029',
			summary: 'Every year on Feb 29'
		},
		{
			type: 'Weekdays',
			every: '1',
			date: '2026-09-19',
			next: 'Mon, Sep 21, 2026',
			summary: 'Every weekday (Mon–Fri)'
		}
	];
	for (const [index, rule] of cases.entries()) {
		await page.clock.setFixedTime(new Date(2026, 8, 16, 8, index));
		await chooseDate(page, rule.date);
		await page.getByRole('button', { name: /^Repeat / }).click();
		await page.getByRole('radio', { name: new RegExp('^' + rule.type) }).check();
		if (rule.type === 'Weekdays') {
			await expect(page.getByLabel('Every', { exact: true })).toHaveCount(0);
			await expect(page.getByText('First due Saturday; then Monday–Friday.')).toBeVisible();
		} else await page.getByLabel('Every', { exact: true }).fill(rule.every);
		await page.getByRole('button', { name: 'Done', exact: true }).click();
		await helper.step(rule.type.toLowerCase(), {
			description: rule.summary,
			verifications: [
				{
					spec: 'The preview and persisted completion agree on the next date',
					check: async () => {
						await expect(page.getByRole('button', { name: /^Repeat / })).toContainText(
							rule.summary
						);
						await expect(page.getByRole('region', { name: 'Upcoming due dates' })).toContainText(
							rule.next
						);
					}
				}
			]
		});
		await saveDetails(page);
		await page.getByRole('button', { name: 'Complete Water the plants', exact: true }).click();
		await openDetails(page);
		await expect(page.getByRole('button', { name: /^Due date/ })).toContainText(rule.next);
	}
	// Overdue weekly schedule skips missed occurrences rather than starting from completion.
	await chooseDate(page, '2026-08-21');
	await chooseRepeat(page, 'Weekly', '2');
	await saveDetails(page);
	await page.clock.setFixedTime(new Date('2026-09-16T13:00:00Z'));
	await page.getByRole('button', { name: 'Complete Water the plants', exact: true }).click();
	await openDetails(page);
	await helper.step('late_completion', {
		verifications: [
			{
				spec: 'Late completion skips missed dates and keeps the Friday anchor',
				check: async () =>
					expect(page.getByRole('button', { name: /^Due date/ })).toContainText('Fri, Sep 18, 2026')
			}
		]
	});
	await chooseRepeat(page, 'Does not repeat');
	await saveDetails(page);
	await openDetails(page);
	await helper.step('stop_repeating', {
		verifications: [
			{
				spec: 'Removing repeat preserves the due date and hides upcoming occurrences',
				check: async () => {
					await expect(page.getByRole('button', { name: /^Due date/ })).toContainText(
						'Fri, Sep 18, 2026'
					);
					await expect(page.getByRole('button', { name: /^Repeat / })).toContainText(
						'Does not repeat'
					);
					await expect(page.getByRole('region', { name: 'Upcoming due dates' })).toHaveCount(0);
				}
			}
		]
	});
	await helper.generateDocs();
});
