<script lang="ts">
	import IconButton from '@smui/icon-button';
	import List, { Item, Graphic } from '@smui/list';

	export let setActive: (name: string) => void;
</script>

<List>
	<Item><img src="all.svg" alt="all" />All</Item>
	<Item href="javascript:void(0)" on:click={() => setActive('starred')}
		><img src="star.svg" alt="starred" />Starred</Item
	>
	<Item><img src="date.svg" alt="by date" />By Date</Item>
	<Item><img src="search.svg" alt="search" />Search</Item>
</List>

<style>
</style>
