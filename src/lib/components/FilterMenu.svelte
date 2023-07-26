<script lang="ts">
	console.log('FilterMenu.svelte');
	import { page } from '$app/stores';
	import List, { Item } from '@smui/list';

	export let setActive: (name: string) => void;

	$: pagePath = $page.url.pathname;
</script>

<List>
	<Item
		href="javascript:void(0)"
		on:click={() => setActive('all')}
		activated={pagePath === '/all'}
		draggable="false"><img src="all.svg" alt="all" />All</Item
	>
	<Item
		href="javascript:void(0)"
		on:click={() => setActive('starred')}
		activated={pagePath === '/starred'}
		draggable="false"><img src="star.svg" alt="starred" />Starred</Item
	>
	<Item
		href="javascript:void(0)"
		on:click={() => setActive('bydate')}
		activated={pagePath === '/bydate'}
		draggable="false"><img src="date.svg" alt="by date" />By Date</Item
	>
	<Item
		href="javascript:void(0)"
		on:click={() => setActive('completed')}
		activated={pagePath === '/completed'}
		draggable="false"><img class="checkmark" src="checkmark.svg" alt="by date" />Completed</Item
	>
	<Item
		href="javascript:void(0)"
		on:click={() => setActive('search')}
		activated={pagePath === '/search'}
		draggable="false"><img src="search.svg" alt="search" />Search</Item
	>
</List>

<style>
	.checkmark {
		margin-right: 10px;
	}
</style>
