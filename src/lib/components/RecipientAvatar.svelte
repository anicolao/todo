<script lang="ts">
	export let photo: string | null | undefined;
	export let name: string;
	let failedPhoto = '';
	$: initials =
		name
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase() || '?';
</script>

<span class="avatar" aria-hidden="true">
	{#if photo && photo !== failedPhoto}
		<img
			src={photo}
			alt=""
			referrerpolicy="no-referrer"
			on:error={() => (failedPhoto = photo || '')}
		/>
	{:else}
		{initials}
	{/if}
</span>

<style>
	.avatar {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		overflow: hidden;
		background: var(--bg);
		color: var(--muted);
		font-size: 0.85em;
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
</style>
