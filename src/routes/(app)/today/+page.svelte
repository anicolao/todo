<script lang="ts">
	console.log('routes/(app)/today/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import type { TodoItem } from '$lib/components/items';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';
	import { isDueToday } from '$lib/dates';

	store.dispatch(set_icon('date_range'));
	store.dispatch(set_title('Today'));

	function isDatedOrStarred(listId: string, itemId: string): boolean {
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
        let today = false
     
		if (item.dueDate !== undefined) {
            const dueDate = item.dueDate;
            const due = new Date(dueDate.year, dueDate.month - 1, dueDate.day);
            today = isDueToday(due);
        }
		return (today || item.starred) && !item.completed;
	}
	function comparator(a: TodoItem, b: TodoItem) {
		if (a.starred && b.starred) {
			return b.starTimestamp - a.starTimestamp;
		}
		if (a.starred) {
			return -1;
		}
		if (b.starred) {
			return 1;
		}
		if (a.dueDate && b.dueDate) {
			const aDate = a.dueDate.year * 10000 + a.dueDate.month * 100 + a.dueDate.day;
			const bDate = b.dueDate.year * 10000 + b.dueDate.month * 100 + b.dueDate.day;
			return aDate - bDate;
		}
		return 0;
	}
</script>

<div class="container">
		<ItemList listIdMatcher={() => true} filter={isDatedOrStarred} {comparator} showListName={true}/>
</div>

<style>
	.container {
		width: 100%;
	}
</style>
