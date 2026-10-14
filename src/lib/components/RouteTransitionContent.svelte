<script lang="ts">
	import { routeSnapshots } from '$lib/mobile-transitions';

	export let screenKey: string;
	export let useSnapshot = false;

	$: wrapperId = `route-screen-${screenKey.replace(/[^a-zA-Z0-9-]/g, '_')}`;
</script>

<div id={wrapperId} class="route-transition-content">
	{#if useSnapshot && $routeSnapshots[screenKey]}
		{@html $routeSnapshots[screenKey].html}
	{:else}
		<slot />
	{/if}
</div>

<style>
	.route-transition-content {
		display: contents;
	}
</style>
