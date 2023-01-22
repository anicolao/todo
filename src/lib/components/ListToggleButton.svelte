<script lang="ts">
	console.log('ListToggleButton.svelte');
	import Button from '@smui/button';
	import Paper from '@smui/paper';

	export let name: string;
	export let showHide: boolean;
	export let buttonAction: (e: CustomEvent) => void;
</script>

<div class="container">
	<Paper variant="unelevated" style="padding: 0.4em;">
		<div class="lineParent">
			<div class="line" />
			<Button on:click={buttonAction}>{showHide ? 'Show ' : 'Hide '}{name}</Button>
			<div class="line" />
		</div>
	</Paper>
</div>

<style>
	.container {
		text-align: center;
		margin: 0.8em 0.25em 0.8em 0.25em;
		opacity: 0.7;
	}

	.lineParent {
		display: flex;
		justify-content: space-evenly;
	}

	.line {
		height: 1px;
		border-top: 1px solid darkgray;
		width: 30%;
    transform: translateY(1em);
	}
</style>
