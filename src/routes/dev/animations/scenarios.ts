import type { ScreenMovement } from '$lib/mobile-transitions';

export type LabViewport = 'portrait' | 'landscape' | 'desktop';
export type LabSurface = 'route' | 'task' | 'list' | 'profile' | 'drawer';
export type LabMotion = 'paired' | 'drawer-open' | 'drawer-select' | 'instant';

export type AnimationScenario = {
	id: string;
	group: string;
	name: string;
	viewport: LabViewport;
	surface: LabSurface;
	fromSurface?: LabSurface;
	toSurface?: LabSurface;
	motion: LabMotion;
	movement: ScreenMovement;
	from: string;
	to: string;
	expected: string;
};

export const animationScenarios: AnimationScenario[] = [
	{
		id: 'portrait-drawer-open',
		group: 'Portrait navigation',
		name: 'Open full-screen drawer',
		viewport: 'portrait',
		surface: 'drawer',
		motion: 'drawer-open',
		movement: 'forward',
		from: 'Weekend errands',
		to: 'Navigation',
		expected:
			'The drawer enters from the left and completely covers the phone while the current list is pushed off the right edge.'
	},
	{
		id: 'portrait-drawer-dismiss',
		group: 'Portrait navigation',
		name: 'Dismiss drawer',
		viewport: 'portrait',
		surface: 'drawer',
		motion: 'drawer-select',
		movement: 'backward',
		from: 'Navigation',
		to: 'Weekend errands',
		expected:
			'The drawer exits left and the unchanged current list returns from the right on the same track.'
	},
	{
		id: 'portrait-drawer-select',
		group: 'Portrait navigation',
		name: 'Choose a list from drawer',
		viewport: 'portrait',
		surface: 'drawer',
		motion: 'drawer-select',
		movement: 'backward',
		from: 'Navigation',
		to: 'Today',
		expected:
			'The drawer exits left as the selected list follows it in from the right, without a second route animation or a flash of the old list.'
	},
	{
		id: 'route-forward',
		group: 'Route navigation',
		name: 'Navigate forward',
		viewport: 'portrait',
		surface: 'route',
		motion: 'paired',
		movement: 'forward',
		from: 'Today',
		to: 'Profile',
		expected:
			'The current route leaves to the left while the destination enters from the right on the same track.'
	},
	{
		id: 'route-backward',
		group: 'Route navigation',
		name: 'Navigate back',
		viewport: 'portrait',
		surface: 'route',
		motion: 'paired',
		movement: 'backward',
		from: 'Profile',
		to: 'Today',
		expected:
			'The current route leaves to the right while the previous route returns from the left.'
	},
	{
		id: 'landscape-list-lower',
		group: 'Landscape list ordering',
		name: 'Choose list below',
		viewport: 'landscape',
		surface: 'route',
		motion: 'paired',
		movement: 'up',
		from: 'Today',
		to: 'Weekend errands',
		expected:
			'The drawer stays fixed. The old right pane leaves upward and the lower list rises from below.'
	},
	{
		id: 'landscape-list-upper',
		group: 'Landscape list ordering',
		name: 'Choose list above',
		viewport: 'landscape',
		surface: 'route',
		motion: 'paired',
		movement: 'down',
		from: 'Weekend errands',
		to: 'Today',
		expected:
			'The drawer stays fixed. The old right pane leaves downward and the higher list descends from above.'
	},
	{
		id: 'task-open',
		group: 'Task details',
		name: 'Open task details',
		viewport: 'portrait',
		surface: 'task',
		fromSurface: 'route',
		motion: 'paired',
		movement: 'forward',
		from: 'Today',
		to: 'Task details',
		expected: 'Task details enters from the right as the list leaves left.'
	},
	{
		id: 'task-drill-in',
		group: 'Task details',
		name: 'Task details → Due date',
		viewport: 'portrait',
		surface: 'task',
		motion: 'paired',
		movement: 'forward',
		from: 'Task details',
		to: 'Due date',
		expected: 'Due date enters from the right as Task details exits left.'
	},
	{
		id: 'task-repeat-drill-in',
		group: 'Task details',
		name: 'Due date → Repeat',
		viewport: 'portrait',
		surface: 'task',
		motion: 'paired',
		movement: 'forward',
		from: 'Due date',
		to: 'Repeat',
		expected: 'Repeat enters from the right as the Due date step exits left.'
	},
	{
		id: 'task-repeat-return',
		group: 'Task details',
		name: 'Repeat → Due date',
		viewport: 'portrait',
		surface: 'task',
		motion: 'paired',
		movement: 'backward',
		from: 'Repeat',
		to: 'Due date',
		expected: 'Due date returns from the left as Repeat exits right.'
	},
	{
		id: 'task-return',
		group: 'Task details',
		name: 'Due date → Task details',
		viewport: 'portrait',
		surface: 'task',
		motion: 'paired',
		movement: 'backward',
		from: 'Due date',
		to: 'Task details',
		expected: 'Task details returns from the left as Due date exits right.'
	},
	{
		id: 'task-close',
		group: 'Task details',
		name: 'Close task details',
		viewport: 'portrait',
		surface: 'task',
		toSurface: 'route',
		motion: 'paired',
		movement: 'backward',
		from: 'Task details',
		to: 'Today',
		expected: 'The task list returns from the left as Task details leaves right.'
	},
	{
		id: 'list-open',
		group: 'List details',
		name: 'Open list details',
		viewport: 'portrait',
		surface: 'list',
		fromSurface: 'route',
		motion: 'paired',
		movement: 'forward',
		from: 'Weekend errands',
		to: 'List details',
		expected: 'List details enters from the right as the list leaves left.'
	},
	{
		id: 'list-drill-in',
		group: 'List details',
		name: 'List details → Sharing',
		viewport: 'portrait',
		surface: 'list',
		motion: 'paired',
		movement: 'forward',
		from: 'List details',
		to: 'Sharing',
		expected: 'Sharing enters from the right as the settings overview exits left.'
	},
	{
		id: 'list-return',
		group: 'List details',
		name: 'Sharing → List details',
		viewport: 'portrait',
		surface: 'list',
		motion: 'paired',
		movement: 'backward',
		from: 'Sharing',
		to: 'List details',
		expected: 'The list settings overview returns from the left as Sharing exits right.'
	},
	{
		id: 'list-close',
		group: 'List details',
		name: 'Close list details',
		viewport: 'portrait',
		surface: 'list',
		toSurface: 'route',
		motion: 'paired',
		movement: 'backward',
		from: 'List details',
		to: 'Weekend errands',
		expected: 'The list returns from the left as List details leaves right.'
	},
	{
		id: 'profile-drill-in',
		group: 'Profile settings',
		name: 'Profile → Item spacing',
		viewport: 'portrait',
		surface: 'profile',
		fromSurface: 'route',
		motion: 'paired',
		movement: 'forward',
		from: 'Profile',
		to: 'Item spacing',
		expected: 'Item spacing enters from the right as Profile exits left.'
	},
	{
		id: 'profile-return',
		group: 'Profile settings',
		name: 'Item spacing → Profile',
		viewport: 'portrait',
		surface: 'profile',
		toSurface: 'route',
		motion: 'paired',
		movement: 'backward',
		from: 'Item spacing',
		to: 'Profile',
		expected: 'Profile returns from the left as Item spacing exits right.'
	},
	{
		id: 'profile-label-drill-in',
		group: 'Profile settings',
		name: 'Label visibility → Label',
		viewport: 'portrait',
		surface: 'profile',
		motion: 'paired',
		movement: 'forward',
		from: 'Label visibility',
		to: 'Visibility',
		expected: 'The individual label editor enters from the right; the label index exits left.'
	},
	{
		id: 'profile-label-return',
		group: 'Profile settings',
		name: 'Label → Label visibility',
		viewport: 'portrait',
		surface: 'profile',
		motion: 'paired',
		movement: 'backward',
		from: 'Visibility',
		to: 'Label visibility',
		expected: 'The label index returns from the left as the individual label editor exits right.'
	},
	{
		id: 'desktop-instant',
		group: 'Motion preferences',
		name: 'Desktop navigation',
		viewport: 'desktop',
		surface: 'route',
		motion: 'instant',
		movement: 'none',
		from: 'Today',
		to: 'Weekend errands',
		expected:
			'The destination replaces the current screen immediately; desktop has no screen transition.'
	},
	{
		id: 'reduced-motion-instant',
		group: 'Motion preferences',
		name: 'Reduced motion',
		viewport: 'portrait',
		surface: 'route',
		motion: 'instant',
		movement: 'none',
		from: 'Today',
		to: 'Profile',
		expected:
			'The destination replaces the current screen immediately when reduced motion is requested.'
	}
];

export const animationGroups = [...new Set(animationScenarios.map((scenario) => scenario.group))];
