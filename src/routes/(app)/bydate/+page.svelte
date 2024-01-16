<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import type { TodoItem } from '$lib/components/items';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

	store.dispatch(set_icon('date_range'));
	store.dispatch(set_title('By Date'));

	function isDated(listId: string, itemId: string) {
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
		return item.dueDate !== undefined && !item.completed;
	}
	function comparator(a: TodoItem, b: TodoItem) {
		if (a.dueDate && b.dueDate) {
			const aDate = a.dueDate.year * 10000 + a.dueDate.month * 100 + a.dueDate.day;
			const bDate = b.dueDate.year * 10000 + b.dueDate.month * 100 + b.dueDate.day;
			return aDate - bDate;
		}
		return 0;
	}
</script>

<div class="container">
	<ItemList listIdMatcher={() => true} filter={isDated} {comparator} showListName={true}/>
</div>

<style>
	.container {
		width: 100%;
	}
</style>
