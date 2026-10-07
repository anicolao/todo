<script lang="ts">
	import { routeSnapshots } from '$lib/mobile-transitions';

	export let screenKey: string;

	$: wrapperId = `route-screen-${screenKey.replace(/[^a-zA-Z0-9-]/g, '_')}`;
</script>

<div id={wrapperId} class="route-transition-content">
	{#if $routeSnapshots[screenKey]}
		{@html $routeSnapshots[screenKey]}
	{:else}
		<slot />
	{/if}
</div>

<style>
	.route-transition-content {
		display: contents;
	}
</style>
