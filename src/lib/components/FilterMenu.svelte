<script lang="ts">
	import IconButton from '@smui/icon-button';
	import List, { Item, Graphic } from '@smui/list';

	export let setActive: (name: string) => void;
</script>

<List>
	<Item href="javascript:void(0)" on:click={() => setActive('all')}
		><img src="all.svg" alt="all" />All</Item
	>
	<Item href="javascript:void(0)" on:click={() => setActive('starred')}
		><img src="star.svg" alt="starred" />Starred</Item
	>
	<Item href="javascript:void(0)" on:click={() => setActive('bydate')}
		><img src="date.svg" alt="by date" />By Date</Item
	>
	<Item href="javascript:void(0)" on:click={() => setActive('search')}
		><img src="search.svg" alt="search" />Search</Item
	>
</List>

<style>
</style>
