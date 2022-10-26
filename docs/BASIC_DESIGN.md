# Basic Design

For our first cut of TODO, we are going to try out a basic design
where everything that exists is created from transaction logs of
redux actions.

The upside implications of this approach are that as long as
the action log reflects the user's intent, we can fix any bug
after the fact to give every user the intended state, no
matter what the bug is; additionally, it'll be easy to replay
a user's experience with redux tools and find bugs after the
fact.

The potential downside implication is that if the transaction
logs get really big, the fact that there isn't really any state
anywhere will make the system slower and slower over time. It
seems reasonably likely that we can finesse this problem in the
future, either by caching intermediate state and restoring it,
or by some other mechanism. All approaches to "fixing" the
potential future performance issues add complexity and we are
going to try to save them until a time that never comes.

## Transaction Logs

For the purposes of the TODO app, the user really only has
two types of actions: those that manage the metadata around
their lists, and those that edit the lists themselves (that
is, the list items contained in each list).

For each user, we can view it as them having only one set of
metadata, which is essentially their "filesystem" of lists.
Since we don't expect users to have hundreds or thousands of
lists, a simple list of lists is all they need along with
ways to create, rearrange, rename, and share lists. We'll
call the transaction log that manages these operations the
user's transaction log or the 'global' transaction log.

For each list, all the operations that affect that list should
be associated with the list itself. Operations that affect its
metadata should not be on the list itself: the idea being to
keep a clear separation between the _meta_ and the _list_ data.

### Global Transaction Logs

Each user's global transactions will be sorted by timestamp
and executed from the first to the last one at application
load time. They'll be stored in firebase in a collection
named `.../users/{uid}/actions`, with arbitrary IDs assigned
by firebase and server side timestamps.

These actions are the source of truth for the user and should
be capable of regenerating all list metadata from scratch.

When the user is using the system live, firebase will echo
back the (as yet uncommitted) transaction to the client,
enabling instant feedback on the client side. Behind the
scenes, we expect firebase to cache the transaction in
local storage and play it into the server side as soon
as the device is online (or immediately, if the device is
already online).

The simple actions we anticipate are:

1. create_list({ id, name })
2. delete_list({ id })
3. reorder_list({ id, after_this_id })

Note that if it wasn't for sharing, we'd have no need for any
of these actions to write anything to the database. The
simple act of replaying these transactions would re-create
all the client-side data needed to display the list of lists.

It's not even really that inefficient to replay from the start
every time, because the user won't really create and destroy that
many lists, so the total set of actions is on the same order as
the actual resulting metadata for the lists (namely their IDs,
names, and order).

One subtlety that we are taking for granted is that the user
would like the _same_ metadata across _all_ their devices: lists in the _same order_, lists all having the _same names_, and
lists all having the _same visibility_ whether the user is on
their phone, tablet, computer, or what have you. If we later
decide that the user needs different views of the metadata
on different devices, we can layer a _filters_ or _views_
lens on top of the base metadata and let the user create
a named view that rearranges what they see when it is picked,
and then let them locally pick different named views (like a
special _mobile_ view). However this just seems like complexity
that we don't need right now.

In a similar way, we can worry about whether the _list name_
itself is part of the _list_ or part of the _metadata_. Our
filesystem intution would tell us to make it _metadata_; just
like we could have symlinks or hard links with different names
to the same data, why not allow two users to have different
names for the same list? _It'd be damn confusing for normal
users, that's why, and tech-savvy users don't need the
feature anyway. So we'll argue that the \_list name_ is part
of the list, and if any user renames the list, it gets
renamed for everyone. That makes the `rename_list` action
a list action, rather than a global action, and it should
be written to the list transaction log and not here.

### Sharing Lists

For better or worse, we really also want to provide sharing,
and one possible design is to have the following global
actions:

1. share_list({ id, uid })
2. accept_share({ id })
3. reject_share({ id })

Sharing is where things get complicated, because we now need
data about lists in the database, for no other purpose than to
mediate access to the underlying data. If we made the database
wide open, we could get away with in memory data structures; but
any reasonable level of security requires firebase security
rules, and firebase security rules require paths in the database
to enable enforcement.

In one possible design, we have a special database path that
contains data specifically about sharing. For example, for
each user we can have a document `.../sharing/{uid}`, and
that document can have a key for each list id, whose value
is its state: `accepted`, `rejected`, or `pending`. The UI can
process those labels in order to show the user the state, and all
users can read and write all the `.../sharing/{uid}` documents.

In another possible design, we can have special database paths for
one user to request an action (any action: list creation, list item
creation or deletion, sharing, _any action_) of another user. In this
alternate design, we could have special database paths of the form
`.../requests/{from_uid}/to/{to_uid}/actions/`, where the `actions`
collection is a list of any actions that `from_uid` has asked `to_uid`
to do. The rules for these action lists would be you can only `write`
to the collection if you're the `from_uid`, and you can only `read`
from the collection if you're the `to_uid`. It's definitely a more
secure design than the previous one; spammers are clearly identified,
and the actions in the `.../requests/` tree just build up forever
in an exactly analogous way to the way actions build up in the
global action list for each user or in the per-list action lists
for each user. The clients replay these actions to build up the
sharing state and can reply to each other about them. For example,
`userid1` might send `userid2` a
`request({ request_id1, action: accept_share({ id }))` and when
`user2` takes action on it they can send a response in the form of
`request({ request_id2, note_action_accepted(request_id1)})`. In
the interests of avoiding infinite chit-chat, there would be no need to ack
an ack and the requests would stop there.

It is possible that in this design it is also desirable to put
the user's own global actions in the `...requests/{my_uid}/to/{my_uid}/actions`
so that a single query can get all global actions in one single ordered
list by server timestamp. This seems pleasingly simple on the client side,
with only one query resultset to manage.

### List transaction logs

For each list, it will have a transaction log that manipulates its own name
and list items and list item ordering. The likely actions are something like:

1. rename_list(new_name)
2. create_item({ id, description, starred, completed })
3. delete_item({ id })
4. reorder_item({ id, after_this_id })
5. complete_item({ id, done_state })
6. star_item({ id, star_state })
7. describe_item({ id, new_description })

Some additional fields might need to be added for things like
reoccurring tasks, or tasks with deadlines. There is no way to
put the same task on two different lists; even if the `id` values
collided, each action list is inside a specific TODO list and
can't affect other TODO list metadata; additionally, in this
design there is no need to specify which list we are speaking of
because the action list in question came from the `actions` collection
of a specific TODO list.

## Local vs Persisted UI state

So far, we have focused on describing actions that need to be recorded
because they are part of the user's lasting state/artifacts: namely new
lists, new permissions, or new tasks. These transaction logs get
replayed every time in order to build up the software's in-memory state
as a redux store that lets the UI render all these artifacts for the
user.

Some actions, though, will need to affect the UI but don't need to be
recorded and replayed. For example, if the user navigates from one list
to another in tab A, they do not want tab B to navigate too. These local
actions can manipulate a slice of the UI state named `ui` and can be
dispached locally on the client. Authentication (in `auth`) also will
be client-side-only state.

The easy way to distinguish actions that should be persisted versus
actions that shouldn't is: _if I take this action in one window, do I expect
to immediately see it everywhere else?_ When the answer is yes, that
action should be in the global action list or in a request to another user;
if the answer is no, then it should be a UI action and get dispatched
locally only.

## Replay considerations

Since the actions are getting executed all the time, it's important that
they be idempotent -- meaning identical requests are harmless and one
request or many leaves the firebase database in the same state. Ideally no
request should fail, so the client can always verify that its replay is
successful. There might be cases where permissions would be denied on
purpose, but ideally a permission denied would signal to the user that
someone else needs to do something to get the server back to the correct
state.

For example, if I'm re-accepting a list share but then can't read the list,
it means the person who shared the list with me needs to load the client
so that it will do the replay. Most of the time those permissions would
already be in place, so the vast majority use case is everything "just works";
but the error message could also be pretty clear about who needs to do what
in order to fix the database.

## Offline

Firebase is supposed to make offline "just work" for us, in that the client
that is offline will act on the local echo of their writes to the server,
and everyone else will automatically see those writes the next time the
client is connected to the network.

There are possibly some pathological edge cases, like a client who only
opens the TODO list app when they have no network and so never syncs their
actions to where other clients can see them. Even in normal cases, the delay
of one client connecting could cause conflicts or other overlaps. How those
conflicts are dealt with is really up to the client-side code; they could get
automatically resolved, or they could be surfaced in the UI state to encourage
the user to take specific action to resolve them. For example, suppose two
different users `describe_item` with different text. One possible resolution
is to just say the action with the later server-side timestamp wins. This
in fact would naturally happen based on the design of the system if we did
no conflict resolution at all.

Alternately, we could write client-side timestamps into these actions, and
write both the before and after state into the action, and then when
it executes the action and sees that there was a conflict the system could
mark the item with a red conflict dot and the UI could allow the user to
at least view and perhaps also manually override the resolution. It's
unclear if the complexity is worth it on the client, but it might be
worth baking enough information into the actions so that conflict resolution
can be easily added later.

# Summing up

In summary, we have three kinds of data in the system:

1. Transaction Logs: the ultimate source of truth
2. Access Conrol: data whose only purpose is to grand or deny access to lists
3. In-memory UI state: the state that the user thinks of as the only data: lists, and their items, which in fact exist only ephemerally in any given client and are re-created from scratch on every client load.

Assuming replay never becomes an issue, this basic design should cover
all offline use cases and all bugfix use cases, while giving the client
a pretty responsive UI.
