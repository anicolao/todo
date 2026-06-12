export interface ActivityList {
	id: string;
	seconds: unknown;
}

export interface SelectListsForRefreshOptions {
	currentListId?: string | null;
	visibleLists: string[];
	listIdToTimestamp: { [id: string]: number | undefined };
	activityLists: ActivityList[];
	isStartup: boolean;
}

export function selectListsForRefresh({
	currentListId,
	visibleLists,
	listIdToTimestamp,
	activityLists,
	isStartup
}: SelectListsForRefreshOptions) {
	const listsToLoad: string[] = [];
	const isVisibleList = (id: string) => visibleLists.indexOf(id) !== -1;
	const addList = (id: string) => {
		if (listsToLoad.indexOf(id) === -1) {
			listsToLoad.push(id);
		}
	};

	if (currentListId && isVisibleList(currentListId)) {
		addList(currentListId);
	}

	activityLists.forEach(({ id, seconds }) => {
		const cachedSeconds = listIdToTimestamp[id] || 0;
		if (typeof seconds === 'number' && seconds > cachedSeconds && isVisibleList(id)) {
			addList(id);
		}
	});

	if (isStartup) {
		visibleLists.forEach((id) => {
			const cachedSeconds = listIdToTimestamp[id] || 0;
			if (cachedSeconds <= 0) {
				addList(id);
			}
		});
	}

	return listsToLoad;
}
