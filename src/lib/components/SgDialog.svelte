<script lang="ts">
	import Dialog from '@smui/dialog';

	export let open: boolean = false;
	export let cancelDialog: CallableFunction | undefined;
	export let labelledby: string = '';
	export let describedby: string = '';

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
>
	<slot />
</Dialog>
