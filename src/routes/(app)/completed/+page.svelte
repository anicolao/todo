<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import type { TodoItem } from '$lib/components/items';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

	store.dispatch(set_icon('check_circle'));
	store.dispatch(set_title('Completed'));

	/*
	const [send, receive] = crossfade({
		duration: (d) => 4000,

		fallback(node, params) {
			const style = getComputedStyle(node);
			const transform = style.transform === 'none' ? '' : style.transform;

			return {
				duration: 6000,
				easing: quintOut,
				css: (t) => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
			};
		}
	});
	*/

	function wasEverCompleted(listId: string, id: string) {
			const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[id];
			return item && item.completedTimestamp !== 0;
	}
	function comparator(a: TodoItem, b: TodoItem) {
		return b.completedTimestamp - a.completedTimestamp;
	}
</script>

<div class="container">
	<ItemList listIdMatcher={() => true} filter={wasEverCompleted} {comparator} />
</div>

<style>
	.container {
		width: 100%;
	}
</style>
