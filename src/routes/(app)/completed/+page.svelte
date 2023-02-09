<script lang="ts">
	console.log('routes/(app)/completed/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import { RepeatType, type TodoItem } from '$lib/components/items';
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

	function hasBeenCompleted(listId: string, id: string) {
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[id];
		const repeatType = item.dueDate?.repeats?.type;
		return (
			item &&
			(item.completed ||
				(repeatType && repeatType !== RepeatType.NONE && item.completedTimestamp !== 0))
		);
	}
	function comparator(a: TodoItem, b: TodoItem) {
		return b.completedTimestamp - a.completedTimestamp;
	}
</script>

<div class="container">
	<ItemList listIdMatcher={() => true} filter={hasBeenCompleted} {comparator} enableUndo={true} />
</div>

<style>
	.container {
		width: 100%;
	}
</style>
