// New Block - Updated July 22, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function to_number(value) {
    return value === '' ? null : +value;
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * Schedules a callback to run immediately before the component is updated after any state change.
 *
 * The first time the callback runs will be before the initial `onMount`
 *
 * https://svelte.dev/docs#run-time-svelte-beforeupdate
 */
function beforeUpdate(fn) {
    get_current_component().$$.before_update.push(fn);
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[35] = list[i];
	const constants_0 = new Date().toLocaleDateString();
	child_ctx[36] = constants_0;
	const constants_1 = `${/*student*/ child_ctx[35].id}_${/*today*/ child_ctx[36]}`;
	child_ctx[37] = constants_1;
	const constants_2 = /*attendance*/ child_ctx[1][/*key*/ child_ctx[37]];
	child_ctx[38] = constants_2;
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[47] = list[i];
	child_ctx[50] = i;
	const constants_0 = /*isDayExpanded*/ child_ctx[9](/*selectedModule*/ child_ctx[3].id, /*selectedWeek*/ child_ctx[4].week, /*dayIndex*/ child_ctx[50] + 1);
	child_ctx[48] = constants_0;
	return child_ctx;
}

function get_each_context_4(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[51] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[44] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[41] = list[i];
	return child_ctx;
}

function get_each_context_5(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[41] = list[i];
	return child_ctx;
}

// (1251:2) {#if currentPage === 'home'}
function create_if_block_5(ctx) {
	let div6;
	let div0;
	let h1;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let p1;
	let t4;
	let t5;
	let div3;
	let div1;
	let h30;
	let t6;
	let t7;
	let p2;
	let t8;
	let t9;
	let div2;
	let h31;
	let t10;
	let t11;
	let p3;
	let t12;
	let t13;
	let div5;
	let h2;
	let t14;
	let t15;
	let div4;
	let each_value_5 = /*courseModules*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value_5.length; i += 1) {
		each_blocks[i] = create_each_block_5(get_each_context_5(ctx, each_value_5, i));
	}

	return {
		c() {
			div6 = element("div");
			div0 = element("div");
			h1 = element("h1");
			t0 = text("Computer Skills for Teens");
			t1 = space();
			p0 = element("p");
			t2 = text("12-Week Comprehensive Training Program");
			t3 = space();
			p1 = element("p");
			t4 = text("Instructor: Mr. Abdelfatah Ahmed");
			t5 = space();
			div3 = element("div");
			div1 = element("div");
			h30 = element("h3");
			t6 = text("📅 Schedule");
			t7 = space();
			p2 = element("p");
			t8 = text("3 days per week • 12 weeks total");
			t9 = space();
			div2 = element("div");
			h31 = element("h3");
			t10 = text("🎯 Format");
			t11 = space();
			p3 = element("p");
			t12 = text("Interactive lessons + Hands-on practice");
			t13 = space();
			div5 = element("div");
			h2 = element("h2");
			t14 = text("What You'll Learn");
			t15 = space();
			div4 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div6 = claim_element(nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div0 = claim_element(div6_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h1 = claim_element(div0_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Computer Skills for Teens");
			h1_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p0 = claim_element(div0_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "12-Week Comprehensive Training Program");
			p0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			p1 = claim_element(div0_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t4 = claim_text(p1_nodes, "Instructor: Mr. Abdelfatah Ahmed");
			p1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t5 = claim_space(div6_nodes);
			div3 = claim_element(div6_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h30 = claim_element(div1_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			t6 = claim_text(h30_nodes, "📅 Schedule");
			h30_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			p2 = claim_element(div1_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t8 = claim_text(p2_nodes, "3 days per week • 12 weeks total");
			p2_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t9 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h31 = claim_element(div2_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			t10 = claim_text(h31_nodes, "🎯 Format");
			h31_nodes.forEach(detach);
			t11 = claim_space(div2_nodes);
			p3 = claim_element(div2_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t12 = claim_text(p3_nodes, "Interactive lessons + Hands-on practice");
			p3_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t13 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h2 = claim_element(div5_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t14 = claim_text(h2_nodes, "What You'll Learn");
			h2_nodes.forEach(detach);
			t15 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div4_nodes);
			}

			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-6q8xwu");
			attr(p0, "class", "subtitle svelte-6q8xwu");
			attr(p1, "class", "instructor svelte-6q8xwu");
			attr(div0, "class", "header svelte-6q8xwu");
			attr(h30, "class", "svelte-6q8xwu");
			attr(p2, "class", "svelte-6q8xwu");
			attr(div1, "class", "info-card svelte-6q8xwu");
			attr(h31, "class", "svelte-6q8xwu");
			attr(p3, "class", "svelte-6q8xwu");
			attr(div2, "class", "info-card svelte-6q8xwu");
			attr(div3, "class", "info-grid svelte-6q8xwu");
			attr(h2, "class", "svelte-6q8xwu");
			attr(div4, "class", "module-list svelte-6q8xwu");
			attr(div5, "class", "modules-overview svelte-6q8xwu");
			attr(div6, "class", "page home svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div6, anchor);
			append_hydration(div6, div0);
			append_hydration(div0, h1);
			append_hydration(h1, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p0);
			append_hydration(p0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, p1);
			append_hydration(p1, t4);
			append_hydration(div6, t5);
			append_hydration(div6, div3);
			append_hydration(div3, div1);
			append_hydration(div1, h30);
			append_hydration(h30, t6);
			append_hydration(div1, t7);
			append_hydration(div1, p2);
			append_hydration(p2, t8);
			append_hydration(div3, t9);
			append_hydration(div3, div2);
			append_hydration(div2, h31);
			append_hydration(h31, t10);
			append_hydration(div2, t11);
			append_hydration(div2, p3);
			append_hydration(p3, t12);
			append_hydration(div6, t13);
			append_hydration(div6, div5);
			append_hydration(div5, h2);
			append_hydration(h2, t14);
			append_hydration(div5, t15);
			append_hydration(div5, div4);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div4, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*courseModules*/ 128) {
				each_value_5 = /*courseModules*/ ctx[7];
				let i;

				for (i = 0; i < each_value_5.length; i += 1) {
					const child_ctx = get_each_context_5(ctx, each_value_5, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_5(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div4, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_5.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div6);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1273:10) {#each courseModules as module}
function create_each_block_5(ctx) {
	let div;
	let span0;
	let t0_value = /*module*/ ctx[41].icon + "";
	let t0;
	let t1;
	let span1;
	let t2_value = /*module*/ ctx[41].title + "";
	let t2;
	let t3;

	return {
		c() {
			div = element("div");
			span0 = element("span");
			t0 = text(t0_value);
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			t3 = space();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			span0 = claim_element(div_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, t0_value);
			span0_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			span1 = claim_element(div_nodes, "SPAN", {});
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, t2_value);
			span1_nodes.forEach(detach);
			t3 = claim_space(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "icon svelte-6q8xwu");
			attr(div, "class", "module-item svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, span0);
			append_hydration(span0, t0);
			append_hydration(div, t1);
			append_hydration(div, span1);
			append_hydration(span1, t2);
			append_hydration(div, t3);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (1284:2) {#if currentPage === 'course'}
function create_if_block_1(ctx) {
	let div;
	let h1;
	let t0;
	let t1;

	function select_block_type(ctx, dirty) {
		if (!/*selectedModule*/ ctx[3]) return create_if_block_2;
		if (!/*selectedWeek*/ ctx[4]) return create_if_block_3;
		return create_else_block;
	}

	let current_block_type = select_block_type(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			div = element("div");
			h1 = element("h1");
			t0 = text("Course Content");
			t1 = space();
			if_block.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			h1 = claim_element(div_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Course Content");
			h1_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			if_block.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-6q8xwu");
			attr(div, "class", "page course svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, h1);
			append_hydration(h1, t0);
			append_hydration(div, t1);
			if_block.m(div, null);
		},
		p(ctx, dirty) {
			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(div, null);
				}
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			if_block.d();
		}
	};
}

// (1323:8) {:else}
function create_else_block(ctx) {
	let div;
	let each_value_3 = /*selectedWeek*/ ctx[4].days;
	let each_blocks = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "days-content svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedWeek, isDayExpanded, selectedModule, toggleDay, handleKeyDown*/ 1816) {
				each_value_3 = /*selectedWeek*/ ctx[4].days;
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_3(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_3.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1308:8) {#if !selectedWeek}
function create_if_block_3(ctx) {
	let div1;
	let h2;
	let t0_value = /*selectedModule*/ ctx[3].icon + "";
	let t0;
	let t1;
	let t2_value = /*selectedModule*/ ctx[3].title + "";
	let t2;
	let t3;
	let div0;
	let each_value_2 = /*selectedModule*/ ctx[3].weeks;
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	return {
		c() {
			div1 = element("div");
			h2 = element("h2");
			t0 = text(t0_value);
			t1 = space();
			t2 = text(t2_value);
			t3 = space();
			div0 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, t0_value);
			t1 = claim_space(h2_nodes);
			t2 = claim_text(h2_nodes, t2_value);
			h2_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div0_nodes);
			}

			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "svelte-6q8xwu");
			attr(div0, "class", "weeks-grid svelte-6q8xwu");
			attr(div1, "class", "week-selector svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, h2);
			append_hydration(h2, t0);
			append_hydration(h2, t1);
			append_hydration(h2, t2);
			append_hydration(div1, t3);
			append_hydration(div1, div0);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div0, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedModule*/ 8 && t0_value !== (t0_value = /*selectedModule*/ ctx[3].icon + "")) set_data(t0, t0_value);
			if (dirty[0] & /*selectedModule*/ 8 && t2_value !== (t2_value = /*selectedModule*/ ctx[3].title + "")) set_data(t2, t2_value);

			if (dirty[0] & /*selectedWeek, selectedModule*/ 24) {
				each_value_2 = /*selectedModule*/ ctx[3].weeks;
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div0, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1288:6) {#if !selectedModule}
function create_if_block_2(ctx) {
	let div;
	let each_value_1 = /*courseModules*/ ctx[7];
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "modules-grid svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedModule, courseModules*/ 136) {
				each_value_1 = /*courseModules*/ ctx[7];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_1.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1362:16) {:else}
function create_else_block_1(ctx) {
	let button;
	let t;
	let mounted;
	let dispose;

	function click_handler_6() {
		return /*click_handler_6*/ ctx[25](/*dayIndex*/ ctx[50]);
	}

	return {
		c() {
			button = element("button");
			t = text("Show Details");
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, "Show Details");
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "show-details-btn svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_6);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (1340:16) {#if expanded}
function create_if_block_4(ctx) {
	let div3;
	let div0;
	let h40;
	let t0;
	let t1;
	let ul;
	let t2;
	let div1;
	let h41;
	let t3;
	let t4;
	let p0;
	let t5_value = /*day*/ ctx[47].exercise + "";
	let t5;
	let t6;
	let div2;
	let h42;
	let t7;
	let t8;
	let p1;
	let t9_value = /*day*/ ctx[47].homework + "";
	let t9;
	let each_value_4 = /*day*/ ctx[47].topics;
	let each_blocks = [];

	for (let i = 0; i < each_value_4.length; i += 1) {
		each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
	}

	return {
		c() {
			div3 = element("div");
			div0 = element("div");
			h40 = element("h4");
			t0 = text("Topics:");
			t1 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t2 = space();
			div1 = element("div");
			h41 = element("h4");
			t3 = text("In-Class Exercise:");
			t4 = space();
			p0 = element("p");
			t5 = text(t5_value);
			t6 = space();
			div2 = element("div");
			h42 = element("h4");
			t7 = text("Homework:");
			t8 = space();
			p1 = element("p");
			t9 = text(t9_value);
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h40 = claim_element(div0_nodes, "H4", { class: true });
			var h40_nodes = children(h40);
			t0 = claim_text(h40_nodes, "Topics:");
			h40_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			ul = claim_element(div0_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h41 = claim_element(div1_nodes, "H4", { class: true });
			var h41_nodes = children(h41);
			t3 = claim_text(h41_nodes, "In-Class Exercise:");
			h41_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			p0 = claim_element(div1_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t5 = claim_text(p0_nodes, t5_value);
			p0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t6 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h42 = claim_element(div2_nodes, "H4", { class: true });
			var h42_nodes = children(h42);
			t7 = claim_text(h42_nodes, "Homework:");
			h42_nodes.forEach(detach);
			t8 = claim_space(div2_nodes);
			p1 = claim_element(div2_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t9 = claim_text(p1_nodes, t9_value);
			p1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h40, "class", "svelte-6q8xwu");
			attr(ul, "class", "svelte-6q8xwu");
			attr(div0, "class", "topics svelte-6q8xwu");
			attr(h41, "class", "svelte-6q8xwu");
			attr(p0, "class", "svelte-6q8xwu");
			attr(div1, "class", "exercise svelte-6q8xwu");
			attr(h42, "class", "svelte-6q8xwu");
			attr(p1, "class", "svelte-6q8xwu");
			attr(div2, "class", "homework svelte-6q8xwu");
			attr(div3, "class", "day-content svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, div0);
			append_hydration(div0, h40);
			append_hydration(h40, t0);
			append_hydration(div0, t1);
			append_hydration(div0, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}

			append_hydration(div3, t2);
			append_hydration(div3, div1);
			append_hydration(div1, h41);
			append_hydration(h41, t3);
			append_hydration(div1, t4);
			append_hydration(div1, p0);
			append_hydration(p0, t5);
			append_hydration(div3, t6);
			append_hydration(div3, div2);
			append_hydration(div2, h42);
			append_hydration(h42, t7);
			append_hydration(div2, t8);
			append_hydration(div2, p1);
			append_hydration(p1, t9);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedWeek*/ 16) {
				each_value_4 = /*day*/ ctx[47].topics;
				let i;

				for (i = 0; i < each_value_4.length; i += 1) {
					const child_ctx = get_each_context_4(ctx, each_value_4, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_4(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_4.length;
			}

			if (dirty[0] & /*selectedWeek*/ 16 && t5_value !== (t5_value = /*day*/ ctx[47].exercise + "")) set_data(t5, t5_value);
			if (dirty[0] & /*selectedWeek*/ 16 && t9_value !== (t9_value = /*day*/ ctx[47].homework + "")) set_data(t9, t9_value);
		},
		d(detaching) {
			if (detaching) detach(div3);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (1345:24) {#each day.topics as topic}
function create_each_block_4(ctx) {
	let li;
	let t_value = /*topic*/ ctx[51] + "";
	let t;

	return {
		c() {
			li = element("li");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			t = claim_text(li_nodes, t_value);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(li, "class", "svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*selectedWeek*/ 16 && t_value !== (t_value = /*topic*/ ctx[51] + "")) set_data(t, t_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1325:12) {#each selectedWeek.days as day, dayIndex}
function create_each_block_3(ctx) {
	let div1;
	let div0;
	let h3;
	let t0;
	let t1_value = /*dayIndex*/ ctx[50] + 1 + "";
	let t1;
	let t2;
	let t3_value = /*day*/ ctx[47].title + "";
	let t3;
	let div0_aria_expanded_value;
	let t4;
	let t5;
	let mounted;
	let dispose;

	function click_handler_5() {
		return /*click_handler_5*/ ctx[23](/*dayIndex*/ ctx[50]);
	}

	function keydown_handler_1(...args) {
		return /*keydown_handler_1*/ ctx[24](/*dayIndex*/ ctx[50], ...args);
	}

	function select_block_type_1(ctx, dirty) {
		if (/*expanded*/ ctx[48]) return create_if_block_4;
		return create_else_block_1;
	}

	let current_block_type = select_block_type_1(ctx);
	let if_block = current_block_type(ctx);

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			h3 = element("h3");
			t0 = text("Day ");
			t1 = text(t1_value);
			t2 = text(": ");
			t3 = text(t3_value);
			t4 = space();
			if_block.c();
			t5 = space();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			div0 = claim_element(div1_nodes, "DIV", {
				class: true,
				tabindex: true,
				role: true,
				"aria-expanded": true
			});

			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Day ");
			t1 = claim_text(h3_nodes, t1_value);
			t2 = claim_text(h3_nodes, ": ");
			t3 = claim_text(h3_nodes, t3_value);
			h3_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			if_block.l(div1_nodes);
			t5 = claim_space(div1_nodes);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-6q8xwu");
			attr(div0, "class", "day-header svelte-6q8xwu");
			attr(div0, "tabindex", "0");
			attr(div0, "role", "button");
			attr(div0, "aria-expanded", div0_aria_expanded_value = /*expanded*/ ctx[48]);
			attr(div1, "class", "day-card svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t0);
			append_hydration(h3, t1);
			append_hydration(h3, t2);
			append_hydration(h3, t3);
			append_hydration(div1, t4);
			if_block.m(div1, null);
			append_hydration(div1, t5);

			if (!mounted) {
				dispose = [
					listen(div0, "click", click_handler_5),
					listen(div0, "keydown", keydown_handler_1)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*selectedWeek*/ 16 && t3_value !== (t3_value = /*day*/ ctx[47].title + "")) set_data(t3, t3_value);

			if (dirty[0] & /*selectedModule, selectedWeek*/ 24 && div0_aria_expanded_value !== (div0_aria_expanded_value = /*expanded*/ ctx[48])) {
				attr(div0, "aria-expanded", div0_aria_expanded_value);
			}

			if (current_block_type === (current_block_type = select_block_type_1(ctx)) && if_block) {
				if_block.p(ctx, dirty);
			} else {
				if_block.d(1);
				if_block = current_block_type(ctx);

				if (if_block) {
					if_block.c();
					if_block.m(div1, t5);
				}
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1312:14) {#each selectedModule.weeks as week}
function create_each_block_2(ctx) {
	let button;
	let t0;
	let t1_value = /*week*/ ctx[44].week + "";
	let t1;
	let t2;
	let mounted;
	let dispose;

	function click_handler_4() {
		return /*click_handler_4*/ ctx[22](/*week*/ ctx[44]);
	}

	return {
		c() {
			button = element("button");
			t0 = text("Week ");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t0 = claim_text(button_nodes, "Week ");
			t1 = claim_text(button_nodes, t1_value);
			t2 = claim_space(button_nodes);
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "week-button svelte-6q8xwu");
			toggle_class(button, "selected", /*selectedWeek*/ ctx[4]?.week === /*week*/ ctx[44].week);
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t0);
			append_hydration(button, t1);
			append_hydration(button, t2);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_4);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*selectedModule*/ 8 && t1_value !== (t1_value = /*week*/ ctx[44].week + "")) set_data(t1, t1_value);

			if (dirty[0] & /*selectedWeek, selectedModule*/ 24) {
				toggle_class(button, "selected", /*selectedWeek*/ ctx[4]?.week === /*week*/ ctx[44].week);
			}
		},
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (1290:10) {#each courseModules as module}
function create_each_block_1(ctx) {
	let div1;
	let img;
	let img_src_value;
	let t0;
	let div0;
	let span;
	let t1_value = /*module*/ ctx[41].icon + "";
	let t1;
	let t2;
	let h3;
	let t3_value = /*module*/ ctx[41].title + "";
	let t3;
	let t4;
	let p;
	let t5;
	let t6_value = /*module*/ ctx[41].weeks[0].week + "";
	let t6;
	let t7;
	let t8_value = /*module*/ ctx[41].weeks[/*module*/ ctx[41].weeks.length - 1].week + "";
	let t8;
	let t9;
	let mounted;
	let dispose;

	function click_handler_3() {
		return /*click_handler_3*/ ctx[20](/*module*/ ctx[41]);
	}

	function keydown_handler(...args) {
		return /*keydown_handler*/ ctx[21](/*module*/ ctx[41], ...args);
	}

	return {
		c() {
			div1 = element("div");
			img = element("img");
			t0 = space();
			div0 = element("div");
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			h3 = element("h3");
			t3 = text(t3_value);
			t4 = space();
			p = element("p");
			t5 = text("Weeks ");
			t6 = text(t6_value);
			t7 = text("-");
			t8 = text(t8_value);
			t9 = space();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true, tabindex: true, role: true });
			var div1_nodes = children(div1);
			img = claim_element(div1_nodes, "IMG", { src: true, alt: true, class: true });
			t0 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(div0_nodes);
			h3 = claim_element(div0_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t3 = claim_text(h3_nodes, t3_value);
			h3_nodes.forEach(detach);
			t4 = claim_space(div0_nodes);
			p = claim_element(div0_nodes, "P", { class: true });
			var p_nodes = children(p);
			t5 = claim_text(p_nodes, "Weeks ");
			t6 = claim_text(p_nodes, t6_value);
			t7 = claim_text(p_nodes, "-");
			t8 = claim_text(p_nodes, t8_value);
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t9 = claim_space(div1_nodes);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			if (!src_url_equal(img.src, img_src_value = /*module*/ ctx[41].image)) attr(img, "src", img_src_value);
			attr(img, "alt", /*module*/ ctx[41].title);
			attr(img, "class", "svelte-6q8xwu");
			attr(span, "class", "icon svelte-6q8xwu");
			attr(h3, "class", "svelte-6q8xwu");
			attr(p, "class", "svelte-6q8xwu");
			attr(div0, "class", "module-info svelte-6q8xwu");
			attr(div1, "class", "module-card svelte-6q8xwu");
			attr(div1, "tabindex", "0");
			attr(div1, "role", "button");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, img);
			append_hydration(div1, t0);
			append_hydration(div1, div0);
			append_hydration(div0, span);
			append_hydration(span, t1);
			append_hydration(div0, t2);
			append_hydration(div0, h3);
			append_hydration(h3, t3);
			append_hydration(div0, t4);
			append_hydration(div0, p);
			append_hydration(p, t5);
			append_hydration(p, t6);
			append_hydration(p, t7);
			append_hydration(p, t8);
			append_hydration(div1, t9);

			if (!mounted) {
				dispose = [
					listen(div1, "click", click_handler_3),
					listen(div1, "keydown", keydown_handler)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
		},
		d(detaching) {
			if (detaching) detach(div1);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1378:2) {#if currentPage === 'attendance'}
function create_if_block(ctx) {
	let div4;
	let h1;
	let t0;
	let t1;
	let div1;
	let h20;
	let t2;
	let t3;
	let div0;
	let input0;
	let t4;
	let input1;
	let t5;
	let button0;
	let t6;
	let t7;
	let div3;
	let div2;
	let h21;
	let t8;
	let t9_value = new Date().toLocaleDateString() + "";
	let t9;
	let t10;
	let button1;
	let t11;
	let t12;
	let table;
	let thead;
	let tr;
	let th0;
	let t13;
	let t14;
	let th1;
	let t15;
	let t16;
	let th2;
	let t17;
	let t18;
	let th3;
	let t19;
	let t20;
	let tbody;
	let mounted;
	let dispose;
	let each_value = /*students*/ ctx[0];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div4 = element("div");
			h1 = element("h1");
			t0 = text("Attendance");
			t1 = space();
			div1 = element("div");
			h20 = element("h2");
			t2 = text("Add New Student");
			t3 = space();
			div0 = element("div");
			input0 = element("input");
			t4 = space();
			input1 = element("input");
			t5 = space();
			button0 = element("button");
			t6 = text("Add Student");
			t7 = space();
			div3 = element("div");
			div2 = element("div");
			h21 = element("h2");
			t8 = text("Today's Attendance - ");
			t9 = text(t9_value);
			t10 = space();
			button1 = element("button");
			t11 = text("📄 Download PDF");
			t12 = space();
			table = element("table");
			thead = element("thead");
			tr = element("tr");
			th0 = element("th");
			t13 = text("Student Name");
			t14 = space();
			th1 = element("th");
			t15 = text("Age");
			t16 = space();
			th2 = element("th");
			t17 = text("Present");
			t18 = space();
			th3 = element("th");
			t19 = text("Absent");
			t20 = space();
			tbody = element("tbody");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			h1 = claim_element(div4_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "Attendance");
			h1_nodes.forEach(detach);
			t1 = claim_space(div4_nodes);
			div1 = claim_element(div4_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h20 = claim_element(div1_nodes, "H2", { class: true });
			var h20_nodes = children(h20);
			t2 = claim_text(h20_nodes, "Add New Student");
			h20_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			input0 = claim_element(div0_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			t4 = claim_space(div0_nodes);

			input1 = claim_element(div0_nodes, "INPUT", {
				type: true,
				placeholder: true,
				min: true,
				max: true,
				class: true
			});

			t5 = claim_space(div0_nodes);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t6 = claim_text(button0_nodes, "Add Student");
			button0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t7 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h21 = claim_element(div2_nodes, "H2", { class: true });
			var h21_nodes = children(h21);
			t8 = claim_text(h21_nodes, "Today's Attendance - ");
			t9 = claim_text(h21_nodes, t9_value);
			h21_nodes.forEach(detach);
			t10 = claim_space(div2_nodes);
			button1 = claim_element(div2_nodes, "BUTTON", { class: true, tabindex: true });
			var button1_nodes = children(button1);
			t11 = claim_text(button1_nodes, "📄 Download PDF");
			button1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t12 = claim_space(div3_nodes);
			table = claim_element(div3_nodes, "TABLE", { class: true });
			var table_nodes = children(table);
			thead = claim_element(table_nodes, "THEAD", {});
			var thead_nodes = children(thead);
			tr = claim_element(thead_nodes, "TR", { class: true });
			var tr_nodes = children(tr);
			th0 = claim_element(tr_nodes, "TH", { class: true });
			var th0_nodes = children(th0);
			t13 = claim_text(th0_nodes, "Student Name");
			th0_nodes.forEach(detach);
			t14 = claim_space(tr_nodes);
			th1 = claim_element(tr_nodes, "TH", { class: true });
			var th1_nodes = children(th1);
			t15 = claim_text(th1_nodes, "Age");
			th1_nodes.forEach(detach);
			t16 = claim_space(tr_nodes);
			th2 = claim_element(tr_nodes, "TH", { class: true });
			var th2_nodes = children(th2);
			t17 = claim_text(th2_nodes, "Present");
			th2_nodes.forEach(detach);
			t18 = claim_space(tr_nodes);
			th3 = claim_element(tr_nodes, "TH", { class: true });
			var th3_nodes = children(th3);
			t19 = claim_text(th3_nodes, "Absent");
			th3_nodes.forEach(detach);
			tr_nodes.forEach(detach);
			thead_nodes.forEach(detach);
			t20 = claim_space(table_nodes);
			tbody = claim_element(table_nodes, "TBODY", {});
			var tbody_nodes = children(tbody);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(tbody_nodes);
			}

			tbody_nodes.forEach(detach);
			table_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "svelte-6q8xwu");
			attr(h20, "class", "svelte-6q8xwu");
			attr(input0, "type", "text");
			attr(input0, "placeholder", "Student Name");
			attr(input0, "class", "svelte-6q8xwu");
			attr(input1, "type", "number");
			attr(input1, "placeholder", "Age");
			attr(input1, "min", "13");
			attr(input1, "max", "19");
			attr(input1, "class", "svelte-6q8xwu");
			attr(button0, "class", "svelte-6q8xwu");
			attr(div0, "class", "form-row svelte-6q8xwu");
			attr(div1, "class", "add-student svelte-6q8xwu");
			attr(h21, "class", "svelte-6q8xwu");
			attr(button1, "class", "pdf-button svelte-6q8xwu");
			attr(button1, "tabindex", "0");
			attr(div2, "class", "table-header svelte-6q8xwu");
			attr(th0, "class", "svelte-6q8xwu");
			attr(th1, "class", "svelte-6q8xwu");
			attr(th2, "class", "svelte-6q8xwu");
			attr(th3, "class", "svelte-6q8xwu");
			attr(tr, "class", "svelte-6q8xwu");
			attr(table, "class", "svelte-6q8xwu");
			attr(div3, "class", "attendance-table svelte-6q8xwu");
			attr(div4, "class", "page attendance svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, h1);
			append_hydration(h1, t0);
			append_hydration(div4, t1);
			append_hydration(div4, div1);
			append_hydration(div1, h20);
			append_hydration(h20, t2);
			append_hydration(div1, t3);
			append_hydration(div1, div0);
			append_hydration(div0, input0);
			set_input_value(input0, /*studentName*/ ctx[5]);
			append_hydration(div0, t4);
			append_hydration(div0, input1);
			set_input_value(input1, /*studentAge*/ ctx[6]);
			append_hydration(div0, t5);
			append_hydration(div0, button0);
			append_hydration(button0, t6);
			append_hydration(div4, t7);
			append_hydration(div4, div3);
			append_hydration(div3, div2);
			append_hydration(div2, h21);
			append_hydration(h21, t8);
			append_hydration(h21, t9);
			append_hydration(div2, t10);
			append_hydration(div2, button1);
			append_hydration(button1, t11);
			append_hydration(div3, t12);
			append_hydration(div3, table);
			append_hydration(table, thead);
			append_hydration(thead, tr);
			append_hydration(tr, th0);
			append_hydration(th0, t13);
			append_hydration(tr, t14);
			append_hydration(tr, th1);
			append_hydration(th1, t15);
			append_hydration(tr, t16);
			append_hydration(tr, th2);
			append_hydration(th2, t17);
			append_hydration(tr, t18);
			append_hydration(tr, th3);
			append_hydration(th3, t19);
			append_hydration(table, t20);
			append_hydration(table, tbody);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(tbody, null);
				}
			}

			if (!mounted) {
				dispose = [
					listen(input0, "input", /*input0_input_handler*/ ctx[26]),
					listen(input1, "input", /*input1_input_handler*/ ctx[27]),
					listen(button0, "click", /*addStudent*/ ctx[11]),
					listen(button1, "click", /*downloadPDF*/ ctx[13]),
					listen(button1, "keydown", /*keydown_handler_2*/ ctx[28])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*studentName*/ 32 && input0.value !== /*studentName*/ ctx[5]) {
				set_input_value(input0, /*studentName*/ ctx[5]);
			}

			if (dirty[0] & /*studentAge*/ 64 && to_number(input1.value) !== /*studentAge*/ ctx[6]) {
				set_input_value(input1, /*studentAge*/ ctx[6]);
			}

			if (dirty[0] & /*students, attendance, updateAttendance*/ 4099) {
				each_value = /*students*/ ctx[0];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(tbody, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div4);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1424:12) {#each students as student}
function create_each_block(ctx) {
	let tr;
	let td0;
	let t0_value = /*student*/ ctx[35].name + "";
	let t0;
	let t1;
	let td1;
	let t2_value = /*student*/ ctx[35].age + "";
	let t2;
	let t3;
	let td2;
	let input0;
	let input0_name_value;
	let input0_checked_value;
	let t4;
	let td3;
	let input1;
	let input1_name_value;
	let input1_checked_value;
	let t5;
	let mounted;
	let dispose;

	function change_handler() {
		return /*change_handler*/ ctx[29](/*student*/ ctx[35]);
	}

	function change_handler_1() {
		return /*change_handler_1*/ ctx[30](/*student*/ ctx[35]);
	}

	return {
		c() {
			tr = element("tr");
			td0 = element("td");
			t0 = text(t0_value);
			t1 = space();
			td1 = element("td");
			t2 = text(t2_value);
			t3 = space();
			td2 = element("td");
			input0 = element("input");
			t4 = space();
			td3 = element("td");
			input1 = element("input");
			t5 = space();
			this.h();
		},
		l(nodes) {
			tr = claim_element(nodes, "TR", { class: true });
			var tr_nodes = children(tr);
			td0 = claim_element(tr_nodes, "TD", { class: true });
			var td0_nodes = children(td0);
			t0 = claim_text(td0_nodes, t0_value);
			td0_nodes.forEach(detach);
			t1 = claim_space(tr_nodes);
			td1 = claim_element(tr_nodes, "TD", { class: true });
			var td1_nodes = children(td1);
			t2 = claim_text(td1_nodes, t2_value);
			td1_nodes.forEach(detach);
			t3 = claim_space(tr_nodes);
			td2 = claim_element(tr_nodes, "TD", { class: true });
			var td2_nodes = children(td2);
			input0 = claim_element(td2_nodes, "INPUT", { type: true, name: true, class: true });
			td2_nodes.forEach(detach);
			t4 = claim_space(tr_nodes);
			td3 = claim_element(tr_nodes, "TD", { class: true });
			var td3_nodes = children(td3);
			input1 = claim_element(td3_nodes, "INPUT", { type: true, name: true, class: true });
			td3_nodes.forEach(detach);
			t5 = claim_space(tr_nodes);
			tr_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(td0, "class", "svelte-6q8xwu");
			attr(td1, "class", "svelte-6q8xwu");
			attr(input0, "type", "radio");
			attr(input0, "name", input0_name_value = "attendance_" + /*student*/ ctx[35].id);
			input0.checked = input0_checked_value = /*status*/ ctx[38] === 'present';
			attr(input0, "class", "svelte-6q8xwu");
			attr(td2, "class", "svelte-6q8xwu");
			attr(input1, "type", "radio");
			attr(input1, "name", input1_name_value = "attendance_" + /*student*/ ctx[35].id);
			input1.checked = input1_checked_value = /*status*/ ctx[38] === 'absent';
			attr(input1, "class", "svelte-6q8xwu");
			attr(td3, "class", "svelte-6q8xwu");
			attr(tr, "class", "svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, tr, anchor);
			append_hydration(tr, td0);
			append_hydration(td0, t0);
			append_hydration(tr, t1);
			append_hydration(tr, td1);
			append_hydration(td1, t2);
			append_hydration(tr, t3);
			append_hydration(tr, td2);
			append_hydration(td2, input0);
			append_hydration(tr, t4);
			append_hydration(tr, td3);
			append_hydration(td3, input1);
			append_hydration(tr, t5);

			if (!mounted) {
				dispose = [
					listen(input0, "change", change_handler),
					listen(input1, "change", change_handler_1)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if (dirty[0] & /*students*/ 1 && t0_value !== (t0_value = /*student*/ ctx[35].name + "")) set_data(t0, t0_value);
			if (dirty[0] & /*students*/ 1 && t2_value !== (t2_value = /*student*/ ctx[35].age + "")) set_data(t2, t2_value);

			if (dirty[0] & /*students*/ 1 && input0_name_value !== (input0_name_value = "attendance_" + /*student*/ ctx[35].id)) {
				attr(input0, "name", input0_name_value);
			}

			if (dirty[0] & /*attendance, students*/ 3 && input0_checked_value !== (input0_checked_value = /*status*/ ctx[38] === 'present')) {
				input0.checked = input0_checked_value;
			}

			if (dirty[0] & /*students*/ 1 && input1_name_value !== (input1_name_value = "attendance_" + /*student*/ ctx[35].id)) {
				attr(input1, "name", input1_name_value);
			}

			if (dirty[0] & /*attendance, students*/ 3 && input1_checked_value !== (input1_checked_value = /*status*/ ctx[38] === 'absent')) {
				input1.checked = input1_checked_value;
			}
		},
		d(detaching) {
			if (detaching) detach(tr);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div;
	let nav;
	let button0;
	let t0;
	let t1;
	let button1;
	let t2;
	let t3;
	let button2;
	let t4;
	let t5;
	let t6;
	let t7;
	let mounted;
	let dispose;
	let if_block0 = /*currentPage*/ ctx[2] === 'home' && create_if_block_5(ctx);
	let if_block1 = /*currentPage*/ ctx[2] === 'course' && create_if_block_1(ctx);
	let if_block2 = /*currentPage*/ ctx[2] === 'attendance' && create_if_block(ctx);

	return {
		c() {
			div = element("div");
			nav = element("nav");
			button0 = element("button");
			t0 = text("Home");
			t1 = space();
			button1 = element("button");
			t2 = text("Course");
			t3 = space();
			button2 = element("button");
			t4 = text("Attendance");
			t5 = space();
			if (if_block0) if_block0.c();
			t6 = space();
			if (if_block1) if_block1.c();
			t7 = space();
			if (if_block2) if_block2.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			nav = claim_element(div_nodes, "NAV", { class: true });
			var nav_nodes = children(nav);
			button0 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t0 = claim_text(button0_nodes, "Home");
			button0_nodes.forEach(detach);
			t1 = claim_space(nav_nodes);
			button1 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t2 = claim_text(button1_nodes, "Course");
			button1_nodes.forEach(detach);
			t3 = claim_space(nav_nodes);
			button2 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t4 = claim_text(button2_nodes, "Attendance");
			button2_nodes.forEach(detach);
			nav_nodes.forEach(detach);
			t5 = claim_space(div_nodes);
			if (if_block0) if_block0.l(div_nodes);
			t6 = claim_space(div_nodes);
			if (if_block1) if_block1.l(div_nodes);
			t7 = claim_space(div_nodes);
			if (if_block2) if_block2.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button0, "class", "svelte-6q8xwu");
			toggle_class(button0, "active", /*currentPage*/ ctx[2] === 'home');
			attr(button1, "class", "svelte-6q8xwu");
			toggle_class(button1, "active", /*currentPage*/ ctx[2] === 'course');
			attr(button2, "class", "svelte-6q8xwu");
			toggle_class(button2, "active", /*currentPage*/ ctx[2] === 'attendance');
			attr(nav, "class", "svelte-6q8xwu");
			attr(div, "class", "container svelte-6q8xwu");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, nav);
			append_hydration(nav, button0);
			append_hydration(button0, t0);
			append_hydration(nav, t1);
			append_hydration(nav, button1);
			append_hydration(button1, t2);
			append_hydration(nav, t3);
			append_hydration(nav, button2);
			append_hydration(button2, t4);
			append_hydration(div, t5);
			if (if_block0) if_block0.m(div, null);
			append_hydration(div, t6);
			if (if_block1) if_block1.m(div, null);
			append_hydration(div, t7);
			if (if_block2) if_block2.m(div, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[17]),
					listen(button1, "click", /*click_handler_1*/ ctx[18]),
					listen(button2, "click", /*click_handler_2*/ ctx[19])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentPage*/ 4) {
				toggle_class(button0, "active", /*currentPage*/ ctx[2] === 'home');
			}

			if (dirty[0] & /*currentPage*/ 4) {
				toggle_class(button1, "active", /*currentPage*/ ctx[2] === 'course');
			}

			if (dirty[0] & /*currentPage*/ 4) {
				toggle_class(button2, "active", /*currentPage*/ ctx[2] === 'attendance');
			}

			if (/*currentPage*/ ctx[2] === 'home') {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(div, t6);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*currentPage*/ ctx[2] === 'course') {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_1(ctx);
					if_block1.c();
					if_block1.m(div, t7);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*currentPage*/ ctx[2] === 'attendance') {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block(ctx);
					if_block2.c();
					if_block2.m(div, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let currentPage = 'home';
	let selectedModule = null;
	let selectedWeek = null;
	let students = [];
	let attendance = {};
	let notes = {};
	let studentName = '';
	let studentAge = '';
	let expandedDays = []; // Tracks which days are expanded

	const courseModules = [
		{
			id: 1,
			title: "Computer & Online Essentials",
			icon: "💻",
			image: "https://placehold.co/600x300/e0e7ff/4c1d95?text=Computer+Essentials",
			weeks: [
				{
					week: 1,
					days: [
						{
							day: 1,
							title: "Introduction to Operating Systems",
							topics: [
								"Understanding Windows/Mac interfaces",
								"Desktop navigation and customization",
								"System settings and control panel",
								"User accounts and permissions"
							],
							exercise: "Create a personalized desktop with 5 organized folders",
							homework: "Screenshot your organized desktop and write 3 benefits of folder organization"
						},
						{
							day: 2,
							title: "File Management Basics",
							topics: [
								"Creating and naming files/folders",
								"Copy, cut, paste operations",
								"File properties and extensions",
								"Search and find functions"
							],
							exercise: "Organize 20 sample files into appropriate folders",
							homework: "Create a folder structure for your school subjects"
						},
						{
							day: 3,
							title: "Advanced File Operations",
							topics: [
								"Compression and extraction (ZIP files)",
								"File backup strategies",
								"Cloud vs local storage",
								"File sharing permissions"
							],
							exercise: "Compress a folder and share it via email",
							homework: "Create a backup plan for your important files"
						}
					]
				},
				{
					week: 2,
					days: [
						{
							day: 1,
							title: "Internet Fundamentals",
							topics: [
								"How the internet works",
								"Web browsers and their features",
								"URLs and navigation",
								"Bookmarks and favorites"
							],
							exercise: "Create bookmark folders for different categories",
							homework: "Research and bookmark 10 educational websites"
						},
						{
							day: 2,
							title: "Email Essentials",
							topics: [
								"Creating professional email addresses",
								"Email composition and etiquette",
								"CC, BCC, and Reply All usage",
								"Organizing inbox with folders"
							],
							exercise: "Send a formal email with proper formatting",
							homework: "Create email templates for different purposes"
						},
						{
							day: 3,
							title: "Internet Safety & Email Management",
							topics: [
								"Recognizing spam and phishing",
								"Safe browsing practices",
								"Managing email attachments",
								"Email signatures and auto-replies"
							],
							exercise: "Set up email filters and organize inbox",
							homework: "Create a professional email signature"
						}
					]
				},
				{
					week: 3,
					days: [
						{
							day: 1,
							title: "Review & Assessment",
							topics: [
								"Module recap and Q&A",
								"Practical demonstrations",
								"Common troubleshooting",
								"Best practices review"
							],
							exercise: "Complete module assessment quiz",
							homework: "Prepare presentation on one topic learned"
						},
						{
							day: 2,
							title: "Project Work",
							topics: [
								"Individual project planning",
								"Resource gathering",
								"Implementation guidance",
								"Peer collaboration"
							],
							exercise: "Start module project",
							homework: "Complete 50% of project tasks"
						},
						{
							day: 3,
							title: "Project Presentations",
							topics: [
								"Project demonstrations",
								"Peer feedback sessions",
								"Improvement suggestions",
								"Module completion celebration"
							],
							exercise: "Present your project to class",
							homework: "Reflect on learning and prepare for next module"
						}
					]
				}
			]
		},
		{
			id: 2,
			title: "Word Processing",
			icon: "📄",
			image: "https://placehold.co/600x300/dbeafe/1e40af?text=Word+Processing",
			weeks: [
				{
					week: 4,
					days: [
						{
							day: 1,
							title: "Document Creation Basics",
							topics: [
								"Creating new documents",
								"Page setup and margins",
								"Basic text entry and editing",
								"Save and file formats"
							],
							exercise: "Create a one-page personal introduction",
							homework: "Write a 300-word essay about your hobby"
						},
						{
							day: 2,
							title: "Text Formatting Fundamentals",
							topics: [
								"Fonts, sizes, and colors",
								"Bold, italic, underline",
								"Text alignment options",
								"Line and paragraph spacing"
							],
							exercise: "Format a provided text document",
							homework: "Create a formatted recipe or instruction guide"
						},
						{
							day: 3,
							title: "Paragraph Formatting",
							topics: [
								"Indentation and tabs",
								"Bullets and numbering",
								"Borders and shading",
								"Paragraph styles"
							],
							exercise: "Create a formatted list document",
							homework: "Design a personal schedule with formatting"
						}
					]
				},
				{
					week: 5,
					days: [
						{
							day: 1,
							title: "Working with Objects",
							topics: [
								"Inserting and formatting images",
								"Text wrapping options",
								"Shapes and SmartArt",
								"Text boxes and positioning"
							],
							exercise: "Create a poster with images and shapes",
							homework: "Design a birthday card using objects"
						},
						{
							day: 2,
							title: "Tables and Lists",
							topics: [
								"Creating and formatting tables",
								"Table styles and borders",
								"Converting text to tables",
								"Advanced list formatting"
							],
							exercise: "Create a class timetable",
							homework: "Design a comparison table for any topic"
						},
						{
							day: 3,
							title: "Headers, Footers & Page Layout",
							topics: [
								"Adding headers and footers",
								"Page numbers and dates",
								"Section breaks",
								"Columns and page orientation"
							],
							exercise: "Create a multi-page report with headers",
							homework: "Format a newsletter with columns"
						}
					]
				},
				{
					week: 6,
					days: [
						{
							day: 1,
							title: "Mail Merge Basics",
							topics: [
								"Understanding mail merge",
								"Creating data sources",
								"Merge fields insertion",
								"Preview and complete merge"
							],
							exercise: "Create personalized invitations",
							homework: "Design a mail merge certificate template"
						},
						{
							day: 2,
							title: "Advanced Features",
							topics: [
								"Styles and themes",
								"Table of contents",
								"References and citations",
								"Document templates"
							],
							exercise: "Create a report with TOC",
							homework: "Build a personal document template"
						},
						{
							day: 3,
							title: "Word Processing Project",
							topics: [
								"Project planning",
								"Document design principles",
								"Professional formatting",
								"Final presentations"
							],
							exercise: "Complete word processing project",
							homework: "Prepare for spreadsheet module"
						}
					]
				}
			]
		},
		{
			id: 3,
			title: "Spreadsheets",
			icon: "📊",
			image: "https://placehold.co/600x300/dcfce7/166534?text=Spreadsheets",
			weeks: [
				{
					week: 7,
					days: [
						{
							day: 1,
							title: "Spreadsheet Basics",
							topics: [
								"Understanding cells and ranges",
								"Data entry techniques",
								"Basic formatting",
								"Saving and file types"
							],
							exercise: "Create a personal expense tracker",
							homework: "Enter one week of expense data"
						},
						{
							day: 2,
							title: "Formulas Introduction",
							topics: [
								"Basic arithmetic formulas",
								"SUM and AVERAGE functions",
								"Cell references (relative/absolute)",
								"Formula copying"
							],
							exercise: "Calculate class grades average",
							homework: "Create a simple calculator spreadsheet"
						},
						{
							day: 3,
							title: "Data Formatting",
							topics: [
								"Number formats (currency, percentage)",
								"Date and time formats",
								"Conditional formatting basics",
								"Cell styles and themes"
							],
							exercise: "Format a sales report",
							homework: "Create a formatted budget spreadsheet"
						}
					]
				},
				{
					week: 8,
					days: [
						{
							day: 1,
							title: "Advanced Functions",
							topics: [
								"COUNT and COUNTA functions",
								"MIN and MAX functions",
								"IF statements basics",
								"Nested formulas"
							],
							exercise: "Build a grade calculator with IF statements",
							homework: "Create a sports statistics tracker"
						},
						{
							day: 2,
							title: "Data Management",
							topics: [
								"Sorting data",
								"Filtering techniques",
								"Data validation",
								"Remove duplicates"
							],
							exercise: "Organize a contact list database",
							homework: "Create a filtered inventory list"
						},
						{
							day: 3,
							title: "Charts and Graphs",
							topics: [
								"Chart types selection",
								"Creating column and pie charts",
								"Chart formatting and styles",
								"Chart elements and labels"
							],
							exercise: "Create charts from survey data",
							homework: "Visualize personal data with 3 chart types"
						}
					]
				},
				{
					week: 9,
					days: [
						{
							day: 1,
							title: "Advanced Features",
							topics: [
								"VLOOKUP basics",
								"Pivot table introduction",
								"Data analysis tools",
								"Protecting cells and sheets"
							],
							exercise: "Create a lookup table system",
							homework: "Build a simple database with VLOOKUP"
						},
						{
							day: 2,
							title: "Spreadsheet Project Planning",
							topics: [
								"Project requirements",
								"Design best practices",
								"Formula optimization",
								"Documentation"
							],
							exercise: "Plan your final project",
							homework: "Complete project data entry"
						},
						{
							day: 3,
							title: "Project Completion",
							topics: [
								"Project finalization",
								"Testing and debugging",
								"Presentation preparation",
								"Peer review"
							],
							exercise: "Present spreadsheet project",
							homework: "Prepare for presentation module"
						}
					]
				}
			]
		},
		{
			id: 4,
			title: "Presentation",
			icon: "🎨",
			image: "https://placehold.co/600x300/fef3c7/d97706?text=Presentations",
			weeks: [
				{
					week: 10,
					days: [
						{
							day: 1,
							title: "Presentation Basics",
							topics: [
								"Creating new presentations",
								"Slide layouts and design",
								"Adding and formatting text",
								"Design principles for slides"
							],
							exercise: "Create a 5-slide self-introduction",
							homework: "Plan a presentation topic"
						},
						{
							day: 2,
							title: "Visual Elements",
							topics: [
								"Inserting images and graphics",
								"Working with shapes and icons",
								"Color schemes and themes",
								"Slide backgrounds"
							],
							exercise: "Design visual slides for a story",
							homework: "Create an image-heavy presentation"
						},
						{
							day: 3,
							title: "Animations and Transitions",
							topics: [
								"Slide transitions types",
								"Object animations",
								"Animation timing",
								"Animation best practices"
							],
							exercise: "Add animations to existing slides",
							homework: "Create an animated infographic"
						}
					]
				},
				{
					week: 11,
					days: [
						{
							day: 1,
							title: "Multimedia Integration",
							topics: [
								"Adding audio clips",
								"Embedding videos",
								"Screen recordings",
								"Media playback options"
							],
							exercise: "Create a multimedia presentation",
							homework: "Record and add narration to slides"
						},
						{
							day: 2,
							title: "Advanced Features",
							topics: [
								"Master slides usage",
								"Presenter view features",
								"Slide notes and handouts",
								"Hyperlinks and actions"
							],
							exercise: "Create an interactive presentation",
							homework: "Design a presentation template"
						},
						{
							day: 3,
							title: "Presentation Skills",
							topics: [
								"Effective presenting techniques",
								"Audience engagement",
								"Time management",
								"Q&A handling"
							],
							exercise: "Practice presenting to peers",
							homework: "Prepare final presentation"
						}
					]
				}
			]
		},
		{
			id: 5,
			title: "Online Collaboration",
			icon: "☁️",
			image: "https://placehold.co/600x300/ede9fe/6d28d9?text=Online+Collaboration",
			weeks: [
				{
					week: 12,
					days: [
						{
							day: 1,
							title: "Cloud Storage Basics",
							topics: [
								"Introduction to cloud services",
								"Uploading and organizing files",
								"Sharing and permissions",
								"Sync and backup features"
							],
							exercise: "Set up cloud storage and share a folder",
							homework: "Organize your files in the cloud"
						},
						{
							day: 2,
							title: "Collaborative Documents",
							topics: [
								"Real-time collaboration",
								"Comments and suggestions",
								"Version history",
								"Collaborative editing etiquette"
							],
							exercise: "Collaborate on a group document",
							homework: "Create a shared project plan"
						},
						{
							day: 3,
							title: "Online Meetings & Calendar",
							topics: [
								"Video conferencing tools",
								"Calendar management",
								"Scheduling meetings",
								"Online communication best practices"
							],
							exercise: "Host a virtual study group",
							homework: "Complete course reflection"
						}
					]
				}
			]
		}
	];

	onMount(() => {
		$$invalidate(0, students = JSON.parse(localStorage.getItem('students') || '[]'));
		$$invalidate(1, attendance = JSON.parse(localStorage.getItem('attendance') || '{}'));
		$$invalidate(15, notes = JSON.parse(localStorage.getItem('notes') || '{}'));
		$$invalidate(16, expandedDays = JSON.parse(localStorage.getItem('expandedDays') || '[]'));
	});

	function toggleDay(moduleId, weekNum, dayNum) {
		const key = `${moduleId}-${weekNum}-${dayNum}`;
		notes[key] || '';

		$$invalidate(16, expandedDays = expandedDays.includes(key)
		? expandedDays.filter(k => k !== key)
		: [...expandedDays, key]);
	}

	function isDayExpanded(moduleId, weekNum, dayNum) {
		return expandedDays.includes(`${moduleId}-${weekNum}-${dayNum}`);
	}

	function handleKeyDown(e, moduleId, weekNum, dayNum) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			toggleDay(moduleId, weekNum, dayNum);
		}
	}

	function addStudent() {
		if (studentName && studentAge) {
			$$invalidate(0, students = [
				...students,
				{
					id: Date.now(),
					name: studentName,
					age: parseInt(studentAge)
				}
			]);

			$$invalidate(5, studentName = '');
			$$invalidate(6, studentAge = '');
		}
	}

	function updateAttendance(studentId, status) {
		const today = new Date().toLocaleDateString();
		const key = `${studentId}_${today}`;
		$$invalidate(1, attendance = { ...attendance, [key]: status });
	}

	function downloadPDF() {
		const today = new Date().toLocaleDateString();
		const doc = new jspdf.jsPDF();
		doc.text('Attendance Report', 20, 20);
		doc.text(`Date: ${today}`, 20, 30);
		doc.text('Instructor: Mr. Abdelfatah Ahmed', 20, 40);
		let y = 60;
		doc.text('Student Name', 20, y);
		doc.text('Age', 80, y);
		doc.text('Status', 120, y);
		y += 10;

		students.forEach(student => {
			const key = `${student.id}_${today}`;
			const status = attendance[key] || 'Not marked';
			doc.text(student.name, 20, y);
			doc.text(student.age.toString(), 80, y);
			doc.text(status, 120, y);
			y += 10;
		});

		doc.save(`attendance_${today.replace(/\//g, '-')}.pdf`);
	}

	beforeUpdate(() => {
		localStorage.setItem('students', JSON.stringify(students));
		localStorage.setItem('attendance', JSON.stringify(attendance));
		localStorage.setItem('notes', JSON.stringify(notes));
	});

	const click_handler = () => $$invalidate(2, currentPage = 'home');

	const click_handler_1 = () => {
		$$invalidate(2, currentPage = 'course');
		$$invalidate(3, selectedModule = null);
		$$invalidate(4, selectedWeek = null);
	};

	const click_handler_2 = () => $$invalidate(2, currentPage = 'attendance');
	const click_handler_3 = module => $$invalidate(3, selectedModule = module);

	const keydown_handler = (module, e) => {
		if (e.key === 'Enter' || e.key === ' ') $$invalidate(3, selectedModule = module);
	};

	const click_handler_4 = week => $$invalidate(4, selectedWeek = week);
	const click_handler_5 = dayIndex => toggleDay(selectedModule.id, selectedWeek.week, dayIndex + 1);
	const keydown_handler_1 = (dayIndex, e) => handleKeyDown(e, selectedModule.id, selectedWeek.week, dayIndex + 1);
	const click_handler_6 = dayIndex => toggleDay(selectedModule.id, selectedWeek.week, dayIndex + 1);

	function input0_input_handler() {
		studentName = this.value;
		$$invalidate(5, studentName);
	}

	function input1_input_handler() {
		studentAge = to_number(this.value);
		$$invalidate(6, studentAge);
	}

	const keydown_handler_2 = e => {
		if (e.key === 'Enter' || e.key === ' ') downloadPDF();
	};

	const change_handler = student => updateAttendance(student.id, 'present');
	const change_handler_1 = student => updateAttendance(student.id, 'absent');

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(14, props = $$props.props);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*students, attendance, notes, expandedDays*/ 98307) {
			// $: localStorage.setItem('students', JSON.stringify(students));
			// $: localStorage.setItem('attendance', JSON.stringify(attendance));
			// $: localStorage.setItem('notes', JSON.stringify(notes));
			// $: localStorage.setItem('activeDays', JSON.stringify(activeDays));
			{
				localStorage.setItem('students', JSON.stringify(students));
				localStorage.setItem('attendance', JSON.stringify(attendance));
				localStorage.setItem('notes', JSON.stringify(notes));
				localStorage.setItem('expandedDays', JSON.stringify(expandedDays));
			}
		}
	};

	return [
		students,
		attendance,
		currentPage,
		selectedModule,
		selectedWeek,
		studentName,
		studentAge,
		courseModules,
		toggleDay,
		isDayExpanded,
		handleKeyDown,
		addStudent,
		updateAttendance,
		downloadPDF,
		props,
		notes,
		expandedDays,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		keydown_handler,
		click_handler_4,
		click_handler_5,
		keydown_handler_1,
		click_handler_6,
		input0_input_handler,
		input1_input_handler,
		keydown_handler_2,
		change_handler,
		change_handler_1
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 14 }, null, [-1, -1]);
	}
}

export { Component as default };
