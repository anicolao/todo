<script lang="ts">
	import type { LabSurface } from './scenarios';

	export let title: string;
	export let surface: LabSurface;
	export let drawer = false;

	const routeRows: Record<string, { text: string; starred?: boolean; done?: boolean }[]> = {
		Today: [
			{ text: 'Review animation timing', starred: true },
			{ text: 'Pick up groceries' },
			{ text: 'Send the TestFlight notes', done: true }
		],
		'Weekend errands': [
			{ text: 'Return library books' },
			{ text: 'Buy potting soil', starred: true },
			{ text: 'Sharpen kitchen knives' }
		]
	};

	$: rows = routeRows[title] || routeRows.Today;
	$: child = !['Profile', 'Task details', 'List details'].includes(title);
	$: backLabel =
		surface === 'profile'
			? title === 'Visibility'
				? '‹ Labels'
				: child
				? '‹ Profile'
				: ''
			: title === 'List details'
			? 'Close'
			: child
			? '‹ Details'
			: 'Cancel';
</script>

{#if drawer}
	<div class="mock-screen drawer-screen" data-screen={title}>
		<div class="drawer-brand">
			<span class="material-icons">check_circle</span><strong>Todo</strong>
		</div>
		<div class="drawer-section">Views</div>
		<div class="drawer-row"><span class="material-icons">today</span><span>Today</span></div>
		<div class="drawer-row"><span class="material-icons">star</span><span>Starred</span></div>
		<div class="drawer-row"><span class="material-icons">search</span><span>Search</span></div>
		<div class="drawer-section">Lists</div>
		<div class="drawer-row selected"><span class="list-dot blue"></span><span>Today</span></div>
		<div class="drawer-row"><span class="list-dot green"></span><span>Weekend errands</span></div>
		<div class="drawer-row"><span class="material-icons">label</span><span>House</span></div>
		<div class="drawer-spacer"></div>
		<div class="drawer-row">
			<span class="material-icons">account_circle</span><span>Profile</span>
		</div>
	</div>
{:else}
	<section class:editor={surface !== 'route'} class="mock-screen" data-screen={title}>
		<header class:editor-header={surface !== 'route'}>
			{#if surface === 'route'}
				<span class="material-icons menu">menu</span><span class="material-icons title-icon"
					>{title === 'Profile' ? 'account_circle' : 'check_circle'}</span
				>
			{:else}
				<span class="back">{backLabel}</span>
			{/if}
			<strong>{title}</strong>
			{#if surface === 'route'}<span class="avatar">A</span>{:else}<span class="header-space"
				></span>{/if}
		</header>

		{#if surface === 'route' && title !== 'Profile'}
			<div class="task-list">
				{#each rows as row}
					<div class:done={row.done} class="task-row">
						<span class="material-icons check"
							>{row.done ? 'check_circle' : 'radio_button_unchecked'}</span
						>
						<span>{row.text}</span>
						<span class="material-icons star">{row.starred ? 'star' : 'star_border'}</span>
					</div>
				{/each}
				<div class="add-row"><span class="material-icons">add</span><span>Add a task</span></div>
			</div>
		{:else if title === 'Profile'}
			<div class="profile-card">
				<div class="profile-avatar">AN</div>
				<div><strong>Alex Nicolao</strong><small>anicolao@gmail.com</small></div>
			</div>
			<div class="section-label">Appearance</div>
			<div class="setting-row">
				<span class="material-icons">density_medium</span><span
					><strong>Item spacing</strong><small>Comfortable</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons">image</span><span
					><strong>Background</strong><small>Default</small></span
				><b>›</b>
			</div>
			<div class="section-label">Lists</div>
			<div class="setting-row">
				<span class="material-icons">label</span><span
					><strong>Label visibility</strong><small>3 labels</small></span
				><b>›</b>
			</div>
		{:else if title === 'Task details'}
			<div class="field-label">Task</div>
			<div class="text-field">Review animation timing</div>
			<div class="section-label">Schedule</div>
			<div class="setting-row">
				<span class="material-icons">event</span><span
					><strong>Due date</strong><small>Today</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons">repeat</span><span
					><strong>Repeat</strong><small>Does not repeat</small></span
				><b>›</b>
			</div>
		{:else if title === 'Due date'}
			<div class="context">Choose when this task should appear in Today.</div>
			<div class="choice selected-choice">
				<span class="material-icons">today</span><span
					><strong>Today</strong><small>October 14</small></span
				><span class="material-icons">radio_button_checked</span>
			</div>
			<div class="choice">
				<span class="material-icons">event</span><span
					><strong>Pick a date</strong><small>Choose from calendar</small></span
				><span class="material-icons">radio_button_unchecked</span>
			</div>
		{:else if title === 'Repeat'}
			<div class="context">Choose how often this task should repeat.</div>
			<div class="choice selected-choice">
				<span><strong>Every week</strong><small>After completion</small></span><span
					class="material-icons">radio_button_checked</span
				>
			</div>
			<div class="choice">
				<span><strong>Every month</strong><small>On the same date</small></span><span
					class="material-icons">radio_button_unchecked</span
				>
			</div>
		{:else if title === 'List details'}
			<div class="section-label">Settings</div>
			<div class="setting-row">
				<span class="material-icons">edit</span><span
					><strong>Name</strong><small>Weekend errands</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons">people</span><span
					><strong>Sharing</strong><small>2 people</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons">label</span><span
					><strong>Labels</strong><small>House</small></span
				><b>›</b>
			</div>
		{:else if title === 'Sharing'}
			<div class="context">Choose who can see and update this list.</div>
			<div class="person">
				<span class="profile-avatar small">AN</span><span
					><strong>Alex Nicolao</strong><small>Owner</small></span
				><span class="material-icons">check</span>
			</div>
			<div class="person">
				<span class="profile-avatar small alt">AM</span><span
					><strong>Andrew</strong><small>Can edit</small></span
				><span class="material-icons">check</span>
			</div>
		{:else if title === 'Item spacing'}
			<div class="context">Choose how much room each task uses.</div>
			<div class="choice selected-choice">
				<span><strong>Comfortable</strong><small>More breathing room</small></span><span
					class="material-icons">radio_button_checked</span
				>
			</div>
			<div class="choice">
				<span><strong>Compact</strong><small>See more at once</small></span><span
					class="material-icons">radio_button_unchecked</span
				>
			</div>
			<div class="section-label">Preview</div>
			<div class="mini-task">○ &nbsp; Review animation timing <span>★</span></div>
			<div class="mini-task">○ &nbsp; Pick up groceries <span>☆</span></div>
		{:else if title === 'Label visibility'}
			<div class="context">Control which labels appear in navigation.</div>
			<div class="setting-row">
				<span class="material-icons amber">label</span><span
					><strong>House</strong><small>Shown</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons blue-text">label</span><span
					><strong>Work</strong><small>Shown</small></span
				><b>›</b>
			</div>
			<div class="setting-row">
				<span class="material-icons green-text">label</span><span
					><strong>Someday</strong><small>Hidden</small></span
				><b>›</b>
			</div>
		{:else if title === 'Visibility'}
			<div class="context"><strong>House</strong><br />Choose where this label is visible.</div>
			<div class="choice selected-choice">
				<span><strong>Shown</strong><small>Show the label and its lists</small></span><span
					class="material-icons">radio_button_checked</span
				>
			</div>
			<div class="choice">
				<span><strong>Collapsed</strong><small>Hide nested lists</small></span><span
					class="material-icons">radio_button_unchecked</span
				>
			</div>
		{/if}
	</section>
{/if}

<style>
	.mock-screen {
		position: absolute;
		inset: 0;
		box-sizing: border-box;
		overflow: hidden;
		background: #fafafa;
		color: #2f2927;
		font:
			14px/1.35 Roboto,
			sans-serif;
	}
	header {
		height: 56px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 16px;
		background: #6d4c41;
		color: white;
		box-shadow: 0 2px 5px #0004;
	}
	header strong {
		flex: 1;
		font-size: 18px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.menu,
	.title-icon {
		font-size: 22px;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #f3d7c5;
		color: #5d4037;
		font-weight: 700;
	}
	.editor {
		background: #f7f4f2;
	}
	.editor-header {
		background: white;
		color: #342b27;
		box-shadow: 0 1px 0 #ded8d4;
	}
	.editor-header strong {
		text-align: center;
	}
	.back {
		min-width: 64px;
		color: #6d4c41;
	}
	.header-space {
		width: 64px;
	}
	.task-list {
		padding: 14px 8px;
	}
	.task-row,
	.add-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 48px;
		padding: 0 10px;
		margin: 2px 0;
		border-radius: 5px;
		background: #fff;
		box-shadow: 0 1px 2px #38251f1f;
	}
	.task-row > span:nth-child(2) {
		flex: 1;
	}
	.task-row.done > span:nth-child(2) {
		color: #887c77;
		text-decoration: line-through;
	}
	.check {
		color: #795548;
	}
	.star {
		color: #d29000;
	}
	.add-row {
		color: #6d4c41;
		background: transparent;
		box-shadow: none;
	}
	.profile-card {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 18px 14px;
		padding: 18px;
		border-radius: 12px;
		background: white;
		box-shadow: 0 1px 4px #38251f21;
	}
	.profile-card small,
	.setting-row small,
	.person small,
	.choice small {
		display: block;
		margin-top: 2px;
		color: #756a65;
		font-weight: 400;
	}
	.profile-avatar {
		display: grid;
		place-items: center;
		flex: none;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: #795548;
		color: white;
		font-weight: 700;
	}
	.profile-avatar.small {
		width: 36px;
		height: 36px;
		font-size: 12px;
	}
	.profile-avatar.alt {
		background: #3f6b78;
	}
	.section-label,
	.field-label {
		margin: 20px 18px 7px;
		color: #72584d;
		font-size: 12px;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.setting-row,
	.person,
	.choice {
		display: flex;
		align-items: center;
		gap: 13px;
		min-height: 58px;
		margin: 0 12px -1px;
		padding: 8px 14px;
		box-sizing: border-box;
		border: 1px solid #ddd6d2;
		background: white;
	}
	.setting-row:first-of-type,
	.choice:first-of-type {
		border-radius: 10px 10px 0 0;
	}
	.setting-row > span:nth-child(2),
	.person > span:nth-child(2),
	.choice > span:first-child:not(.material-icons),
	.choice > span:nth-child(2) {
		flex: 1;
	}
	.setting-row b {
		color: #9b8e87;
		font-size: 24px;
		font-weight: 400;
	}
	.text-field {
		margin: 0 16px;
		padding: 13px 12px;
		border: 1px solid #9d8b82;
		border-radius: 5px;
		background: white;
	}
	.context {
		margin: 22px 18px 14px;
		color: #615651;
	}
	.choice {
		margin-bottom: 8px;
		border-radius: 10px !important;
	}
	.selected-choice {
		border-color: #795548;
		background: #f8f0ed;
	}
	.choice > .material-icons:last-child {
		color: #795548;
	}
	.person {
		margin-bottom: 8px;
		border-radius: 10px;
	}
	.person > .material-icons {
		margin-left: auto;
		color: #477148;
	}
	.mini-task {
		display: flex;
		margin: 3px 16px;
		padding: 12px;
		border-radius: 6px;
		background: white;
		box-shadow: 0 1px 2px #38251f1f;
	}
	.mini-task span {
		margin-left: auto;
		color: #d29000;
	}
	.amber {
		color: #cb8410;
	}
	.blue-text {
		color: #3974a8;
	}
	.green-text {
		color: #4f7d53;
	}
	.drawer-screen {
		z-index: 3;
		display: flex;
		flex-direction: column;
		background: #fff;
		box-shadow: 3px 0 12px #0004;
	}
	.drawer-brand {
		display: flex;
		align-items: center;
		gap: 12px;
		height: 58px;
		padding: 0 18px;
		color: #6d4c41;
		font-size: 18px;
	}
	.drawer-brand .material-icons {
		font-size: 25px;
	}
	.drawer-section {
		padding: 15px 20px 5px;
		color: #846e64;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.drawer-row {
		display: flex;
		align-items: center;
		gap: 15px;
		height: 42px;
		margin: 2px;
		padding: 0 17px;
		border-radius: 5px;
	}
	.drawer-row.selected {
		background: #efe4df;
		color: #5d4037;
		font-weight: 500;
	}
	.drawer-row .material-icons {
		width: 24px;
		color: #795548;
	}
	.drawer-spacer {
		flex: 1;
	}
	.list-dot {
		width: 18px;
		height: 18px;
		margin: 0 3px;
		border-radius: 5px;
		background: #3974a8;
	}
	.list-dot.green {
		background: #4f7d53;
	}
</style>
