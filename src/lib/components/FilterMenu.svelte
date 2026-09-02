<script lang="ts">
	console.log('FilterMenu.svelte');
	import { page } from '$app/stores';
	import List, { Item } from '@smui/list';

	export let setActive: (name: string, keepDrawerOpen?: boolean) => void;

	$: pagePath = $page.url.pathname;
</script>

<List>
	<Item on:click={() => setActive('all')} activated={pagePath === '/all'} draggable="false"
		><img src="/new/all.svg" alt="" />All</Item
	>
	<Item on:click={() => setActive('starred')} activated={pagePath === '/starred'} draggable="false"
		><img src="/new/star.svg" alt="" />Starred</Item
	>
	<Item on:click={() => setActive('bydate')} activated={pagePath === '/bydate'} draggable="false"
		><img src="/new/date.svg" alt="" />By Date</Item
	>
	<Item on:click={() => setActive('today')} activated={pagePath === '/today'} draggable="false"
		><img src="/new/today.svg" alt="" />Today</Item
	>
	<Item
		on:click={() => setActive('completed')}
		activated={pagePath === '/completed'}
		draggable="false"><img src="/new/checkmark.svg" alt="" />Completed</Item
	>
	<Item on:click={() => setActive('search')} activated={pagePath === '/search'} draggable="false"
		><img src="/new/search.svg" alt="" />Search</Item
	>
</List>
