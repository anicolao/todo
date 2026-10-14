export type LabViewport = 'portrait' | 'landscape' | 'desktop';
export type LabSetup =
	| 'upper-list'
	| 'upper-list-drawer'
	| 'lower-list'
	| 'task-details'
	| 'task-date'
	| 'task-repeat-via-date'
	| 'task-repeat-after-date'
	| 'list-details'
	| 'list-sharing'
	| 'profile'
	| 'profile-spacing'
	| 'profile-labels'
	| 'profile-label';
export type LabTrigger =
	| 'open-drawer'
	| 'dismiss-drawer'
	| 'select-upper-list'
	| 'select-lower-list'
	| 'select-profile'
	| 'open-task'
	| 'close-task'
	| 'open-date'
	| 'open-repeat'
	| 'finish-date'
	| 'back-details'
	| 'back-date'
	| 'open-list-details'
	| 'close-list-details'
	| 'open-sharing'
	| 'back-list-details'
	| 'open-spacing'
	| 'back-profile'
	| 'open-profile-label'
	| 'back-labels';

export type AnimationScenario = {
	id: string;
	group: string;
	name: string;
	viewport: LabViewport;
	setup: LabSetup;
	trigger: LabTrigger;
	reducedMotion?: boolean;
	expected: string;
};

export const animationScenarios: AnimationScenario[] = [
	{
		id: 'portrait-drawer-open',
		group: 'Portrait navigation',
		name: 'Open full-screen drawer',
		viewport: 'portrait',
		setup: 'upper-list',
		trigger: 'open-drawer',
		expected:
			'The real drawer enters from the left and covers the phone while the current list is pushed off the right edge.'
	},
	{
		id: 'portrait-drawer-dismiss',
		group: 'Portrait navigation',
		name: 'Dismiss drawer',
		viewport: 'portrait',
		setup: 'upper-list-drawer',
		trigger: 'dismiss-drawer',
		expected:
			'The real drawer exits left and the unchanged current list returns from the right on the same track.'
	},
	{
		id: 'portrait-drawer-select',
		group: 'Portrait navigation',
		name: 'Choose a list from drawer',
		viewport: 'portrait',
		setup: 'upper-list-drawer',
		trigger: 'select-lower-list',
		expected:
			'The drawer exits left as Weekend errands follows from the right, with no second route animation or stale Today content.'
	},
	{
		id: 'landscape-list-lower',
		group: 'Landscape navigation',
		name: 'Choose list below',
		viewport: 'landscape',
		setup: 'upper-list',
		trigger: 'select-lower-list',
		expected:
			'The real drawer stays fixed. The Today title and items leave upward together as the lower Weekend errands list rises from below.'
	},
	{
		id: 'landscape-list-upper',
		group: 'Landscape navigation',
		name: 'Choose list above',
		viewport: 'landscape',
		setup: 'lower-list',
		trigger: 'select-upper-list',
		expected:
			'The real drawer stays fixed. The Weekend errands title and items leave downward together as the higher Today list descends from above.'
	},
	{
		id: 'landscape-route-forward',
		group: 'Landscape navigation',
		name: 'List → Profile',
		viewport: 'landscape',
		setup: 'upper-list',
		trigger: 'select-profile',
		expected:
			'The right pane uses the standard horizontal forward transition because Profile has no relative list position.'
	},
	{
		id: 'task-open',
		group: 'Task details',
		name: 'Open task details',
		viewport: 'portrait',
		setup: 'upper-list',
		trigger: 'open-task',
		expected:
			'The real task editor should enter as a forward screen without exposing the list beneath it.'
	},
	{
		id: 'task-date',
		group: 'Task details',
		name: 'Task details → Due date',
		viewport: 'portrait',
		setup: 'task-details',
		trigger: 'open-date',
		expected: 'The real Due date editor enters from the right as Task details exits left.'
	},
	{
		id: 'task-date-return',
		group: 'Task details',
		name: 'Due date → Task details',
		viewport: 'portrait',
		setup: 'task-date',
		trigger: 'back-details',
		expected: 'The real Task details screen returns from the left as Due date exits right.'
	},
	{
		id: 'task-repeat',
		group: 'Task details',
		name: 'Task details → Repeat',
		viewport: 'portrait',
		setup: 'task-details',
		trigger: 'open-repeat',
		expected: 'The real Repeat editor enters from the right as Task details exits left.'
	},
	{
		id: 'task-date-to-repeat',
		group: 'Task details',
		name: 'New due date → Repeat',
		viewport: 'portrait',
		setup: 'task-repeat-via-date',
		trigger: 'finish-date',
		expected: 'The real Repeat editor continues forward from the Due date step.'
	},
	{
		id: 'task-repeat-to-date',
		group: 'Task details',
		name: 'Repeat → Due date',
		viewport: 'portrait',
		setup: 'task-repeat-after-date',
		trigger: 'back-date',
		expected: 'The real Due date step returns from the left as Repeat exits right.'
	},
	{
		id: 'task-close',
		group: 'Task details',
		name: 'Close task details',
		viewport: 'portrait',
		setup: 'task-details',
		trigger: 'close-task',
		expected: 'The real list should return as a backward screen while Task details exits right.'
	},
	{
		id: 'list-open',
		group: 'List details',
		name: 'Open list details',
		viewport: 'portrait',
		setup: 'upper-list-drawer',
		trigger: 'open-list-details',
		expected:
			'The full-screen drawer exits left as the real List details editor enters from the right. The list is not the outgoing screen.'
	},
	{
		id: 'list-sharing',
		group: 'List details',
		name: 'List details → Sharing',
		viewport: 'portrait',
		setup: 'list-details',
		trigger: 'open-sharing',
		expected: 'The real Sharing screen enters from the right as List details exits left.'
	},
	{
		id: 'list-sharing-return',
		group: 'List details',
		name: 'Sharing → List details',
		viewport: 'portrait',
		setup: 'list-sharing',
		trigger: 'back-list-details',
		expected: 'The real List details overview returns from the left as Sharing exits right.'
	},
	{
		id: 'list-close',
		group: 'List details',
		name: 'Close list details',
		viewport: 'portrait',
		setup: 'list-details',
		trigger: 'close-list-details',
		expected:
			'List details exits right and reveals the selected list directly; the drawer does not return.'
	},
	{
		id: 'profile-spacing',
		group: 'Profile settings',
		name: 'Profile → Item spacing',
		viewport: 'portrait',
		setup: 'profile',
		trigger: 'open-spacing',
		expected: 'The real Item spacing editor enters from the right as Profile moves away.'
	},
	{
		id: 'profile-spacing-return',
		group: 'Profile settings',
		name: 'Item spacing → Profile',
		viewport: 'portrait',
		setup: 'profile-spacing',
		trigger: 'back-profile',
		expected: 'The real Profile screen returns from the left as Item spacing exits right.'
	},
	{
		id: 'profile-label',
		group: 'Profile settings',
		name: 'Label visibility → Label',
		viewport: 'portrait',
		setup: 'profile-labels',
		trigger: 'open-profile-label',
		expected:
			'The real House visibility editor enters from the right as the label index exits left.'
	},
	{
		id: 'profile-label-return',
		group: 'Profile settings',
		name: 'Label → Label visibility',
		viewport: 'portrait',
		setup: 'profile-label',
		trigger: 'back-labels',
		expected: 'The real label index returns from the left as the House editor exits right.'
	},
	{
		id: 'desktop-instant',
		group: 'Motion preferences',
		name: 'Desktop navigation',
		viewport: 'desktop',
		setup: 'upper-list',
		trigger: 'select-lower-list',
		expected:
			'The real destination replaces the current screen immediately; desktop has no transition.'
	},
	{
		id: 'reduced-motion-instant',
		group: 'Motion preferences',
		name: 'Reduced motion',
		viewport: 'portrait',
		setup: 'upper-list-drawer',
		trigger: 'select-lower-list',
		reducedMotion: true,
		expected:
			'The real destination replaces the current screen immediately when reduced motion is enabled.'
	}
];

export const animationGroups = [...new Set(animationScenarios.map((scenario) => scenario.group))];
