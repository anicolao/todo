<script lang="ts">
	import { dispatchLabelAction } from '$lib/components/ActionLog';
	import {
		getLabelVisibility,
		set_label_visibility,
		type LabelVisibility
	} from '$lib/components/labels';
	import { store } from '$lib/store';
	import Button, { Label } from '@smui/button';
	import { Actions, Content } from '@smui/dialog';
	import Paper from '@smui/paper';
	import SgDialog from './SgDialog.svelte';

	let open = false;
	$: labelIds = $store.lists.visibleLists.filter((id) => $store.lists.listIdToType[id] === 'label');

	function closeDialog() {
		open = false;
	}

	function isLabelVisibility(value: string): value is LabelVisibility {
		return value === 'visible' || value === 'hidden' || value === 'fully_hidden';
	}

	async function changeVisibility(labelId: string, event: Event) {
		const visibility = (event.currentTarget as HTMLSelectElement).value;
		const uid = $store.auth.uid;
		if (
			!uid ||
			!isLabelVisibility(visibility) ||
			getLabelVisibility($store.labels.labelIdToLabel[labelId]) === visibility
		) {
			return;
		}
		const action = set_label_visibility({ label_id: labelId, visibility });
		store.dispatch(action);
		await dispatchLabelAction(labelId, uid, action);
	}
</script>

<div class="hidden-list-settings">
	<Paper variant="unelevated">
		<Button variant="outlined" on:click={() => (open = true)}>
			<Label>Configure Hidden Lists</Label>
		</Button>
	</Paper>
</div>

{#if open}
	<SgDialog
		bind:open
		cancelDialog={closeDialog}
		labelledby="hidden-list-settings-title"
		describedby="hidden-list-settings-description"
		className="hidden-list-dialog"
	>
		<h2 id="hidden-list-settings-title">Configure Hidden Lists</h2>
		<Content>
			<div id="hidden-list-settings-description" class="description">
				Choose how each label appears in TODO. Hidden labels remain in Lists so you can open them.
				Fully hidden labels appear only here. This changes UI and search results, not permissions.
			</div>

			{#if labelIds.length === 0}
				<p class="empty-state">
					No labels yet. Create a label from a list, then return here to configure it.
				</p>
			{:else}
				<div class="label-settings-list">
					{#each labelIds as labelId (labelId)}
						<div class="label-setting-row">
							<div class="label-name">
								<label for={`label-visibility-${labelId}`}>
									{$store.lists.listIdToList[labelId] || 'Untitled Label'}
								</label>
								{#if $store.lists.listIdToLastKnownInfo[labelId]?.ownerEmail && $store.lists.listIdToLastKnownInfo[labelId]?.ownerEmail !== $store.auth.email}
									<small>
										Shared by {$store.lists.listIdToLastKnownInfo[labelId].ownerEmail}
									</small>
								{/if}
							</div>
							<select
								id={`label-visibility-${labelId}`}
								aria-label={`Visibility for ${
									$store.lists.listIdToList[labelId] || 'Untitled Label'
								}`}
								value={getLabelVisibility($store.labels.labelIdToLabel[labelId])}
								on:change={(event) => changeVisibility(labelId, event)}
							>
								<option value="visible">Visible — show normally</option>
								<option value="hidden">Hidden — exclude from searches</option>
								<option value="fully_hidden">Fully hidden — show only here</option>
							</select>
						</div>
					{/each}
				</div>
			{/if}
		</Content>
		<Actions>
			<Button on:click={closeDialog}><Label>Done</Label></Button>
		</Actions>
	</SgDialog>
{/if}

<style>
	.hidden-list-settings {
		margin-top: 1rem;
		padding: 1rem;
	}
	h2 {
		font-size: 1.25rem;
		font-weight: 500;
		margin: 0;
		padding: 1.5rem 1.5rem 0.5rem;
	}
	.description {
		line-height: 1.4;
		max-width: 34rem;
	}
	.empty-state {
		margin: 1.5rem 0 0;
	}
	.label-settings-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}
	.label-setting-row {
		align-items: center;
		display: grid;
		gap: 1rem;
		grid-template-columns: minmax(8rem, 1fr) minmax(15rem, 1.5fr);
	}
	.label-setting-row label {
		overflow-wrap: anywhere;
	}
	.label-name {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.label-name small {
		color: #555;
	}
	.label-setting-row select {
		background: white;
		border: 1px solid #777;
		border-radius: 0.25rem;
		font: inherit;
		min-height: 2.75rem;
		padding: 0.5rem;
	}
	@media (max-width: 540px) {
		:global(.hidden-list-dialog .mdc-dialog__surface) {
			border-radius: 0;
			height: 100vh;
			max-height: 100vh;
			max-width: 100vw;
			width: 100vw;
		}
		.label-setting-row {
			align-items: stretch;
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}
	}
</style>
