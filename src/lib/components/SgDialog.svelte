<script lang="ts">
	import Dialog from '@smui/dialog';

	export let open: boolean = false;
	export let cancelDialog: CallableFunction | undefined;
	export let labelledby: string = '';
	export let describedby: string = '';
	export let className: string = '';

	function closeHandler(e: CustomEvent<{ action: string }>) {
		switch (e.detail.action) {
			case 'close':
				cancelDialog && cancelDialog();
				break;
		}
	}
</script>

<Dialog
	bind:open
	on:SMUIDialog:closed={closeHandler}
	aria-labelledby={labelledby}
	aria-describedby={describedby}
	class={`safe-area-dialog ${className}`}
>
	<slot />
</Dialog>

<style>
	:global(.safe-area-dialog) {
		padding: var(--safe-area-top) var(--safe-area-right) var(--safe-area-bottom)
			var(--safe-area-left);
		box-sizing: border-box;
	}
	:global(.safe-area-dialog .mdc-dialog__surface) {
		max-height: calc(100vh - var(--safe-area-top) - var(--safe-area-bottom) - 32px);
		max-height: calc(100dvh - var(--safe-area-top) - var(--safe-area-bottom) - 32px);
		max-width: calc(100vw - var(--safe-area-left) - var(--safe-area-right) - 32px);
	}
</style>
