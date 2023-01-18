<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

	store.dispatch(set_icon('star'));
	store.dispatch(set_title('Starred'));

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

	function isStarred(listId: string, itemId: string) {
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
		return item.starred && !item.completed;
	}
</script>

<div class="container">
	<ItemList listIdMatcher={() => true} filter={isStarred} />
</div>

<style>
	.container {
		width: 100%;
	}
</style>
