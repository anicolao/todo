<script lang="ts">
	console.log('routes/(app)/+layout.svelte');
	import { goto } from '$app/navigation';
	import AcceptShare from '$lib/components/AcceptShare.svelte';
	import { dispatch } from '$lib/components/ActionLog';
	import type { AuthState } from '$lib/components/auth';
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterMenu from '$lib/components/FilterMenu.svelte';
	import { describe_item, remove_due_date, RepeatType, set_due_date } from '$lib/components/items';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import {
		accept_pending_share,
		create_list,
		delete_list,
		rename_list,
		revoke_share
	} from '$lib/components/lists';
	import { incoming_request } from '$lib/components/requests';
	import SgDialog from '$lib/components/SgDialog.svelte';
	import { show_edit_dialog, show_item_detail_dialog } from '$lib/components/ui';
	import { add_user, emailToUid, getSharedUsers } from '$lib/components/users';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import { getVersion } from '$lib/version';
	import type { AnyAction } from '@reduxjs/toolkit';
	import Button, { Label } from '@smui/button';
	import Checkbox from '@smui/checkbox';
	import { Actions } from '@smui/dialog';
	import Drawer, { AppContent, Content, Scrim, Subtitle } from '@smui/drawer';
	import IconButton, { Icon } from '@smui/icon-button';
	import List, { Graphic, Item, Subheader, Text } from '@smui/list';
	import Paper from '@smui/paper';
	import Select, { Option } from '@smui/select';
	import Textfield from '@smui/textfield';
	import TopAppBar, { AutoAdjust, Row, Section, Title } from '@smui/top-app-bar';
	import {
		collection,
		collectionGroup,
		onSnapshot,
		orderBy,
		query,
		where,
		type Unsubscribe
	} from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import ShareList from './ShareList.svelte';

	let count = 0;
	onDestroy(() => {
		console.log('routes/(app)/+layout.svelte: Destroyed with count ', { count });
	});

	let unsubscribeActions: Unsubscribe | undefined = undefined;
	let unsubscribeUsers: Unsubscribe | undefined = undefined;
	console.log('routes/(app)/+layout.svelte loaded', {
		unsubscribeActions,
		unsubscribeUsers,
		count
	});
	$: if ($store.auth.signedIn) {
		console.log('routes/(app)/+layout.svelte: WE ARE SIGNED IN ', count++);
		if (unsubscribeUsers === undefined) {
			const user = $store.auth;
			if (user.uid) {
				const users = collection(firebase.firestore, 'users');
				unsubscribeUsers = onSnapshot(query(users), (querySnapshot) => {
					querySnapshot.docChanges().forEach((change) => {
						if (change.type === 'added') {
							let doc = change.doc;
							console.log(doc.data());
							store.dispatch(add_user(doc.data()));
						}
					});
				});

				const actions = collectionGroup(firebase.firestore, 'requests');
				const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
				console.log('routes/(app)/+layout.svelte: Subscribing to actions for you', {
					'prev unsub': unsubscribeActions
				});
				unsubscribeActions = onSnapshot(q, (querySnapshot) => {
					querySnapshot.docChanges().forEach((change) => {
						if (change.type === 'added') {
							let doc = change.doc;
							let data = { ...doc.data() };
							if (data.timestamp) {
								console.log('server side data: ', data);
								data.timestamp = data.timestamp.seconds;
							} else {
								console.log('client side data: ', data);
							}
							if (
								data.creator === user.uid ||
								data.type === 'accept_request' ||
								data.type === 'reject_request'
							) {
								store.dispatch(data as AnyAction);
							} else {
								store.dispatch(
									incoming_request({ id: doc.id, uid: data.creator, action: data as AnyAction })
								);
							}
						}
					});
				});
			}
		}
	} else {
		console.log('routes/(app)/+layout.svelte: WE ARE *not* SIGNED IN');
		if (!$store.auth.signedIn) {
			cleanupSubscriptions();
		}
	}
	function cleanupSubscriptions() {
		console.log('routes/(app)/+layout.svelte: CLEANING UP');
		if (unsubscribeUsers) {
			unsubscribeUsers();
			console.log('routes/(app)/+layout.svelte: UN SUBSCRIBED to users');
			unsubscribeUsers = undefined;
		}
		if (unsubscribeActions) {
			unsubscribeActions();
			console.log('routes/(app)/+layout.svelte: UN SUBSCRIBED to actions');
			unsubscribeActions = undefined;
		}
	}
	onDestroy(cleanupSubscriptions);

	let width = 0;
	const MOBILE_LAYOUT_WIDTH = 720;

	$: drawerOpen = width > MOBILE_LAYOUT_WIDTH;
	let topAppBar;

	let active: string;
	function setActive(name: string) {
		drawerOpen = width > MOBILE_LAYOUT_WIDTH;
		active = name;
		goto('/' + name);
	}

	function getIconName(name: string) {
		return name;
	}
	function textLookup(text: string) {
		const i18n: { [k: string]: string } = {
			account_circle: 'Profile'
		};
		return i18n[text];
	}

	let newListName = '';

	function handleEnterKey(e: CustomEvent | KeyboardEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			createList(newListName);
			newListName = '';
		}
	}

	function createList(name: string) {
		const id = crypto.randomUUID();
		firebase.dispatch(create_list({ id, name }));
	}

	$: itemDetailsOpen = $store.ui.showItemDetailsDialog;
	$: itemDescription = '';
	let dueDate = new Date(0);
	let dueDateStr = '';
	let currentItemId = '';
	let useDueDate = false;
	let repeatValue = "Doesn't repeat";
	let repeatKind = ["Doesn't repeat", 'Daily', 'Weekly', 'Monthly', 'Yearly', 'Every Weekday'];
	const repeatDescription = [
		'Never',
		'Every # Days',
		'Every # Weeks',
		'Every # Months',
		'Every # Years',
		'Every # Weekdays'
	];
	function getRepeatEveryDesciption(kind: string, every: number) {
		const idx = repeatKind.indexOf(kind);
		let desc = '';
		if (idx > 0) {
			desc = repeatDescription[idx].replaceAll('#', '' + every);
			if (every === 1) {
				desc = desc.replace(/s$/, '');
			}
		}
		return desc;
	}
	const repeatType = [
		RepeatType.NONE,
		RepeatType.DAILY,
		RepeatType.WEEKLY,
		RepeatType.MONTHLY,
		RepeatType.YEARLY,
		RepeatType.WEEKDAYS
	];
	let repeatEvery = 1;
	$: if (!repeatEvery || repeatEvery < 1 || repeatEvery > 365) {
		repeatEvery = 1;
	}
	let lastItemId = '';
	$: if ($store.ui.itemId && $store.ui.itemId !== lastItemId) {
		lastItemId = $store.ui.itemId;
		console.log({ currentItemId });
		if (currentItemId !== $store.ui.itemId) {
			const listOfItems = $store.items.listIdToListOfItems[$store.ui.listId];
			const item = listOfItems.itemIdToItem[$store.ui.itemId];
			const desc = item.description;
			currentItemId = $store.ui.itemId;
			itemDescription = desc;
			useDueDate = !!item.dueDate;
			dueDate = item.dueDate
				? new Date(item.dueDate.year, item.dueDate.month - 1, item.dueDate.day)
				: new Date();
			const m = dueDate.getMonth() + 1;
			const d = dueDate.getDate();
			dueDateStr =
				dueDate.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
			/*
			const dayName = dueDate.toLocaleDateString('en-us', { weekday: 'long' });
			const monthDay = dueDate.toLocaleDateString('en-us', { month: 'short', day: 'numeric' });
			repeatKind = [
				"Doesn't repeat",
				'Daily',
				`Weekly on ${dayName}`,
				'Monthly on day ' + d,
				`Yearly on ${monthDay}`,
				'Every Weekday (Mon to Fri)'
			];
			*/
			if (item.dueDate?.repeats) {
				const indexOfKind = repeatType.indexOf(item.dueDate.repeats.type);
				repeatValue = repeatKind[indexOfKind];
				repeatEvery = item.dueDate.repeats.every;
			} else {
				repeatValue = repeatKind[0];
				repeatEvery = 1;
			}
			// console.log({ repeatValue, repeatKind, kinds: repeatKind.toString() });
		}
	}

	$: dialogOpen = $store.ui.showEditDialog;
	$: listName = '';
	$: if ($store.ui.title && !dialogOpen) {
		if (listName !== $store.ui.title) listName = $store.ui.title;
	}

	function closeDialog() {
		const uid = $store.auth.uid;
		const id = $store.ui.listId;
		const name = listName;
		if (uid) {
			if (listName !== $store.ui.title) {
				const action = rename_list({ id, name });
				dispatch('lists', id, uid, action);
			}
			const previousShares = getSharedUsers()
				.map((u: AuthState) => u.email)
				.sort();
			const currentShares = selectedShareUsers.sort();
			console.log({ previousShares, currentShares });
			let pi = 0;
			let ci = 0;
			function revokeShare(dontShareWith: string) {
				console.log('routes/(app)/+layout.svelte: remove share for ' + dontShareWith);
				firebase.request(emailToUid($store.users, dontShareWith), revoke_share({ id }));
			}
			function grantShare(shareWith: string) {
				console.log('routes/(app)/+layout.svelte: new share for ' + shareWith);
				firebase.request(emailToUid($store.users, shareWith), accept_pending_share(id));
			}
			while (pi < previousShares.length && ci < currentShares.length) {
				if (previousShares[pi] === currentShares[ci]) {
					pi++;
					ci++;
				} else if (previousShares[pi] < currentShares[ci]) {
					// remove a previously granted share
					revokeShare(previousShares[pi]);
					pi++;
				} else {
					// grant a new share
					grantShare(currentShares[ci]);
					ci++;
				}
			}
			for (; pi < previousShares.length; ++pi) {
				revokeShare(previousShares[pi]);
			}
			for (; ci < currentShares.length; ++ci) {
				grantShare(currentShares[ci]);
			}
		}
		selectedShareUsers = [];
		store.dispatch(show_edit_dialog(false));
	}

	function closeItemDetailsDialog() {
		const uid = $store.auth.uid;
		const listId = $store.ui.listId;
		const id = $store.ui.itemId;
		if (uid) {
			const listOfItems = $store.items.listIdToListOfItems[listId];
			const item = listOfItems.itemIdToItem[$store.ui.itemId];
			const orig_description = item.description;
			if (itemDescription !== orig_description) {
				dispatch(
					'lists',
					listId,
					uid,
					describe_item({ list_id: listId, id, orig_description, description: itemDescription })
				);
			}
			const origUseDueDate = !!item.dueDate;
			const ymd = dueDateStr.split('-');
			const year = parseInt(ymd[0]);
			const month = parseInt(ymd[1]);
			const day = parseInt(ymd[2]);
			const indexOfRepeat = repeatKind.indexOf(repeatValue);
			const type = repeatType[indexOfRepeat];
			const every = repeatEvery;
			if (
				useDueDate !== origUseDueDate ||
				(useDueDate &&
					(year !== item.dueDate.year ||
						month !== item.dueDate.month ||
						day !== item.dueDate.day)) ||
				(useDueDate && item.dueDate.repeats && item.dueDate.repeats.type !== type) ||
				(useDueDate && item.dueDate.repeats && item.dueDate.repeats.every !== every) ||
				(useDueDate && !item.dueDate.repeats && type !== RepeatType.NONE)
			) {
				if (useDueDate) {
					const due_date = {
						...item.dueDate,
						year,
						month,
						day,
						repeats: { ...item.dueDate?.repeats, type, every }
					};
					dispatch('lists', listId, uid, set_due_date({ list_id: listId, id, due_date }));
				} else {
					dispatch('lists', listId, uid, remove_due_date({ list_id: listId, id }));
				}
			}
		}
		currentItemId = '';
	}

	function cancelDialog() {
		store.dispatch(show_edit_dialog(false));
	}

	function cancelItemDetailsDialog() {
		currentItemId = '';
		store.dispatch(show_item_detail_dialog(false));
	}

	function deleteList() {
		const id = $store.ui.listId;
		const uid = $store.auth.uid;
		if (uid) {
			dispatch('lists', id, uid, delete_list(id));
		}
		store.dispatch(show_edit_dialog(false));
		const remainingLists = $store.lists.visibleLists.filter((x: string) => x !== id);
		if (remainingLists.length == 0) {
			setActive('profile');
		} else {
			setActive('lists?listId=' + remainingLists[0]);
		}
	}

	$: bgUrl = $store?.uiSettings?.backgroundUrl;
	$: bgStyle = bgUrl ? `url(${bgUrl})` : '';

	let selectedShareUsers: string[] = [];
</script>

<svelte:window bind:innerWidth={width} />

<div class="drawer-container">
	<TopAppBar bind:this={topAppBar} variant="fixed">
		<Row>
			<div class={width > MOBILE_LAYOUT_WIDTH ? 'desk-margin' : 'mobile-margin'}>
				<Section>
					{#if width <= MOBILE_LAYOUT_WIDTH}
						<IconButton
							class="material-icons"
							on:click={() => (drawerOpen = !drawerOpen || width > MOBILE_LAYOUT_WIDTH)}
							>menu</IconButton
						>
					{/if}
					<IconButton class="material-icons">{$store.ui.icon}</IconButton><Title
						>{$store.ui.title}</Title
					>
				</Section>
			</div>
			<Section align="end" toolbar>
				<span><Avatar name={$store.auth.name} photo={$store.auth.photo} /></span>
			</Section>
		</Row>
	</TopAppBar>

	<AutoAdjust {topAppBar} />

	<Drawer
		variant={width > MOBILE_LAYOUT_WIDTH ? undefined : 'modal'}
		fixed={width > MOBILE_LAYOUT_WIDTH ? undefined : false}
		bind:open={drawerOpen}
	>
		<Content>
			<FilterMenu {setActive} />
			<ListMenu {setActive}/>
			<div class="verticalspacer" />
			<AcceptShare />
			<Textfield
				style="width: 100%; min-height: 55px;"
				bind:value={newListName}
				label="New list"
				enterkeyhint="enter"
				input$enterkeyhint="enter"
				on:keydown={handleEnterKey}
				><Icon class="material-icons" slot="leadingIcon">add</Icon></Textfield
			>
			<List>
				<Subheader>Settings</Subheader>
				<Item
					href="javascript:void(0)"
					on:click={() => setActive('profile')}
					activated={active === 'profile'}
				>
					<Graphic class="material-icons" aria-hidden="true"
						>{getIconName('account_circle')}</Graphic
					>
					<Text>{textLookup('account_circle')}</Text>
				</Item>
				<Subheader>{getVersion()}</Subheader>
			</List>
		</Content>
	</Drawer>

	<Scrim fixed={false} />
	<AppContent class="app-content">
		<div class="backdrop" style:background-image={bgStyle}>
			<slot />
			<SgDialog
				bind:open={itemDetailsOpen}
				cancelDialog={cancelItemDetailsDialog}
				labelledby="itemdetails-dialog-title"
				describedby="itemdetails-dialog-content"
			>
				<div class="itemdetails-title-div">
					<Title id="itemdetails-dialog-title">Edit Task</Title>
				</div>
				<Content id="itemdetails-dialog-content">
					<Paper style="width=100%;">
						<Textfield textarea bind:value={itemDescription} label="Task" style="width: 100%;" />
						<Checkbox bind:checked={useDueDate} />
						<Textfield
							type="date"
							bind:value={dueDateStr}
							disabled={!useDueDate}
							label="Task due date"
						/>
						<br />
						<Select
							key={(x) => x.substr(0, 3)}
							bind:value={repeatValue}
							label="Repeat"
							disabled={!useDueDate}
							style="padding-left: 2.75em;"
						>
							{#each repeatKind as value}
								<Option {value}>{value}</Option>
							{/each}
						</Select>
						<Textfield
							bind:value={repeatEvery}
							label={getRepeatEveryDesciption(repeatValue, repeatEvery)}
							type="number"
							input$step="1"
							disabled={!useDueDate || repeatKind.indexOf(repeatValue) === 0}
							style="width: 6em;"
						/>
					</Paper>
				</Content>
				<Actions>
					<Button on:click={cancelItemDetailsDialog}>
						<Label>Cancel</Label>
					</Button>
					<Button on:click={closeItemDetailsDialog}>
						<Label>Save</Label>
					</Button>
				</Actions>
			</SgDialog>
			<SgDialog
				bind:open={dialogOpen}
				{cancelDialog}
				labelledby="editlist-dialog-title"
				describedby="editlist-dialog-content"
			>
				<!-- Title cannot contain leading whitespace due to mdc-typography-baseline-top() -->
				<div class="editlist-dialog-title-div">
					<Title id="editlist-dialog-title">Edit List</Title>
				</div>
				<Content id="editlist-dialog-content">
					<div class="editlist-dialog-content-div">
						<Paper variant="unelevated">
							<Textfield bind:value={listName} label="Name" />
						</Paper>
						<Paper variant="unelevated"
							><Subtitle>Share with:</Subtitle>
							<ShareList bind:selected={selectedShareUsers} />
						</Paper>
					</div>
				</Content>
				<Actions>
					<IconButton on:click={deleteList} class="material-icons">delete</IconButton>
					<Button on:click={cancelDialog}>
						<Label>Cancel</Label>
					</Button>
					<Button on:click={closeDialog}>
						<Label>Done</Label>
					</Button>
				</Actions>
			</SgDialog>
		</div>
	</AppContent>
</div>

<style>
	:global(.mdc-drawer__content) {
		display: flex;
		flex-direction: column;
	}
	.verticalspacer {
		display: flex;
		flex: 1;
	}
	/* Hide everything above this component. */
	:global(app),
	:global(body),
	:global(html) {
		display: block !important;
		height: auto !important;
		width: auto !important;
		position: static !important;
		margin: 0;
		padding: 0;
	}

	.drawer-container {
		position: relative;
		display: flex;
		height: 100vh;
		max-width: 100vw;
		overflow: hidden;
		z-index: 0;
		flex-grow: 1;
	}

	* :global(.app-content) {
		position: relative;
		margin-top: 64px;
		padding: 0;

		display: flex;
		flex: auto;
	}

	.mobile-margin {
		margin-left: 0;
	}
	.desk-margin {
		margin-left: 256px;
	}
	.editlist-dialog-content-div {
		padding-left: 0.5em;
		padding-right: 0.5em;
	}

	.editlist-dialog-title-div {
		padding-top: 0.75em;
	}

	* :global(.mdc-text-field__input::-webkit-calendar-picker-indicator) {
		display: initial !important;
	}

	* :global(.mdc-text-field__resizer) {
		height: 17em;
	}

	.backdrop {
		display: flex;
		flex: auto;
		flex-grow: 1;
		overflow: auto;

		background-size: cover;
	}
</style>
