// New Block - Updated August 6, 2025
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
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
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
	child_ctx[13] = list[i];
	child_ctx[15] = i;
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[16] = list[i];
	child_ctx[15] = i;
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[18] = list[i];
	child_ctx[15] = i;
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[20] = list[i];
	child_ctx[15] = i;
	return child_ctx;
}

function get_each_context_4(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[22] = list[i];
	return child_ctx;
}

// (790:12) {#each module.topics as topic}
function create_each_block_4(ctx) {
	let li;
	let t_value = /*topic*/ ctx[22] + "";
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
			attr(li, "class", "svelte-128jgpb");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (772:4) {#each modules as module, index}
function create_each_block_3(ctx) {
	let div5;
	let div3;
	let div0;
	let t0_value = /*module*/ ctx[20].icon + "";
	let t0;
	let t1;
	let div1;
	let h3;
	let t2_value = /*module*/ ctx[20].title + "";
	let t2;
	let t3;
	let span;
	let t4_value = /*module*/ ctx[20].weeks + "";
	let t4;
	let t5;
	let div2;
	let t6_value = /*module*/ ctx[20].difficulty + "";
	let t6;
	let t7;
	let p;
	let t8_value = /*module*/ ctx[20].description + "";
	let t8;
	let t9;
	let div4;
	let h4;
	let t10;
	let t11;
	let ul;
	let t12;
	let button;
	let t13;
	let t14;
	let mounted;
	let dispose;
	let each_value_4 = /*module*/ ctx[20].topics;
	let each_blocks = [];

	for (let i = 0; i < each_value_4.length; i += 1) {
		each_blocks[i] = create_each_block_4(get_each_context_4(ctx, each_value_4, i));
	}

	return {
		c() {
			div5 = element("div");
			div3 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			div1 = element("div");
			h3 = element("h3");
			t2 = text(t2_value);
			t3 = space();
			span = element("span");
			t4 = text(t4_value);
			t5 = space();
			div2 = element("div");
			t6 = text(t6_value);
			t7 = space();
			p = element("p");
			t8 = text(t8_value);
			t9 = space();
			div4 = element("div");
			h4 = element("h4");
			t10 = text("Key Topics:");
			t11 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t12 = space();
			button = element("button");
			t13 = text("Explore Module");
			t14 = space();
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", { class: true, style: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, t0_value);
			div0_nodes.forEach(detach);
			t1 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, t2_value);
			h3_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			span = claim_element(div1_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t4 = claim_text(span_nodes, t4_value);
			span_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t5 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			t6 = claim_text(div2_nodes, t6_value);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t7 = claim_space(div5_nodes);
			p = claim_element(div5_nodes, "P", { class: true });
			var p_nodes = children(p);
			t8 = claim_text(p_nodes, t8_value);
			p_nodes.forEach(detach);
			t9 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			h4 = claim_element(div4_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t10 = claim_text(h4_nodes, "Key Topics:");
			h4_nodes.forEach(detach);
			t11 = claim_space(div4_nodes);
			ul = claim_element(div4_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			t12 = claim_space(div5_nodes);
			button = claim_element(div5_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t13 = claim_text(button_nodes, "Explore Module");
			button_nodes.forEach(detach);
			t14 = claim_space(div5_nodes);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "module-icon svelte-128jgpb");
			attr(h3, "class", "svelte-128jgpb");
			attr(span, "class", "module-weeks svelte-128jgpb");
			attr(div1, "class", "module-meta svelte-128jgpb");
			attr(div2, "class", "difficulty-badge difficulty-" + /*module*/ ctx[20].difficulty.toLowerCase() + " svelte-128jgpb");
			attr(div3, "class", "module-header svelte-128jgpb");
			attr(p, "class", "module-description svelte-128jgpb");
			attr(h4, "class", "svelte-128jgpb");
			attr(ul, "class", "topics-list svelte-128jgpb");
			attr(div4, "class", "module-topics svelte-128jgpb");
			attr(button, "class", "module-cta svelte-128jgpb");
			attr(div5, "class", "module-card " + /*module*/ ctx[20].color + " svelte-128jgpb");
			set_style(div5, "animation-delay", /*index*/ ctx[15] * 100 + "ms");
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, div3);
			append_hydration(div3, div0);
			append_hydration(div0, t0);
			append_hydration(div3, t1);
			append_hydration(div3, div1);
			append_hydration(div1, h3);
			append_hydration(h3, t2);
			append_hydration(div1, t3);
			append_hydration(div1, span);
			append_hydration(span, t4);
			append_hydration(div3, t5);
			append_hydration(div3, div2);
			append_hydration(div2, t6);
			append_hydration(div5, t7);
			append_hydration(div5, p);
			append_hydration(p, t8);
			append_hydration(div5, t9);
			append_hydration(div5, div4);
			append_hydration(div4, h4);
			append_hydration(h4, t10);
			append_hydration(div4, t11);
			append_hydration(div4, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}

			append_hydration(div5, t12);
			append_hydration(div5, button);
			append_hydration(button, t13);
			append_hydration(div5, t14);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_2*/ ctx[10]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty & /*modules*/ 8) {
				each_value_4 = /*module*/ ctx[20].topics;
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
		},
		d(detaching) {
			if (detaching) detach(div5);
			destroy_each(each_blocks, detaching);
			mounted = false;
			dispose();
		}
	};
}

// (812:4) {#each ageGroups as group, index}
function create_each_block_2(ctx) {
	let div3;
	let div0;
	let t0_value = /*group*/ ctx[18].icon + "";
	let t0;
	let t1;
	let h3;
	let t2_value = /*group*/ ctx[18].name + "";
	let t2;
	let t3;
	let div1;
	let t4_value = /*group*/ ctx[18].ages + "";
	let t4;
	let t5;
	let p;
	let t6_value = /*group*/ ctx[18].description + "";
	let t6;
	let t7;
	let div2;
	let strong;
	let t8;
	let t9;
	let span;
	let t10_value = /*group*/ ctx[18].approach + "";
	let t10;
	let t11;

	return {
		c() {
			div3 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			h3 = element("h3");
			t2 = text(t2_value);
			t3 = space();
			div1 = element("div");
			t4 = text(t4_value);
			t5 = space();
			p = element("p");
			t6 = text(t6_value);
			t7 = space();
			div2 = element("div");
			strong = element("strong");
			t8 = text("Teaching Approach:");
			t9 = space();
			span = element("span");
			t10 = text(t10_value);
			t11 = space();
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true, style: true });
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, t0_value);
			div0_nodes.forEach(detach);
			t1 = claim_space(div3_nodes);
			h3 = claim_element(div3_nodes, "H3", {});
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, t2_value);
			h3_nodes.forEach(detach);
			t3 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t4 = claim_text(div1_nodes, t4_value);
			div1_nodes.forEach(detach);
			t5 = claim_space(div3_nodes);
			p = claim_element(div3_nodes, "P", { class: true });
			var p_nodes = children(p);
			t6 = claim_text(p_nodes, t6_value);
			p_nodes.forEach(detach);
			t7 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			strong = claim_element(div2_nodes, "STRONG", { class: true });
			var strong_nodes = children(strong);
			t8 = claim_text(strong_nodes, "Teaching Approach:");
			strong_nodes.forEach(detach);
			t9 = claim_space(div2_nodes);
			span = claim_element(div2_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t10 = claim_text(span_nodes, t10_value);
			span_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "group-icon svelte-128jgpb");
			attr(div1, "class", "group-ages svelte-128jgpb");
			attr(p, "class", "group-description svelte-128jgpb");
			attr(strong, "class", "svelte-128jgpb");
			attr(span, "class", "svelte-128jgpb");
			attr(div2, "class", "group-approach svelte-128jgpb");
			attr(div3, "class", "age-group-card svelte-128jgpb");
			set_style(div3, "animation-delay", /*index*/ ctx[15] * 150 + "ms");
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, div0);
			append_hydration(div0, t0);
			append_hydration(div3, t1);
			append_hydration(div3, h3);
			append_hydration(h3, t2);
			append_hydration(div3, t3);
			append_hydration(div3, div1);
			append_hydration(div1, t4);
			append_hydration(div3, t5);
			append_hydration(div3, p);
			append_hydration(p, t6);
			append_hydration(div3, t7);
			append_hydration(div3, div2);
			append_hydration(div2, strong);
			append_hydration(strong, t8);
			append_hydration(div2, t9);
			append_hydration(div2, span);
			append_hydration(span, t10);
			append_hydration(div3, t11);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div3);
		}
	};
}

// (835:4) {#each assessmentSchedule as assessment, index}
function create_each_block_1(ctx) {
	let div2;
	let div0;
	let span;
	let t0;
	let t1_value = /*assessment*/ ctx[16].week + "";
	let t1;
	let t2;
	let div1;
	let h4;
	let t3_value = /*assessment*/ ctx[16].type + "";
	let t3;
	let t4;
	let p;
	let t5_value = /*assessment*/ ctx[16].module + "";
	let t5;
	let t6;

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			span = element("span");
			t0 = text("W");
			t1 = text(t1_value);
			t2 = space();
			div1 = element("div");
			h4 = element("h4");
			t3 = text(t3_value);
			t4 = space();
			p = element("p");
			t5 = text(t5_value);
			t6 = space();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true, style: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t0 = claim_text(span_nodes, "W");
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h4 = claim_element(div1_nodes, "H4", { class: true });
			var h4_nodes = children(h4);
			t3 = claim_text(h4_nodes, t3_value);
			h4_nodes.forEach(detach);
			t4 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t5 = claim_text(p_nodes, t5_value);
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t6 = claim_space(div2_nodes);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "week-number svelte-128jgpb");
			attr(div0, "class", "timeline-marker svelte-128jgpb");
			attr(h4, "class", "svelte-128jgpb");
			attr(p, "class", "svelte-128jgpb");
			attr(div1, "class", "timeline-content svelte-128jgpb");

			attr(div2, "class", "timeline-item " + (/*assessment*/ ctx[16].type.includes('Test')
			? 'major'
			: 'minor') + " svelte-128jgpb");

			set_style(div2, "animation-delay", /*index*/ ctx[15] * 100 + "ms");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, span);
			append_hydration(span, t0);
			append_hydration(span, t1);
			append_hydration(div2, t2);
			append_hydration(div2, div1);
			append_hydration(div1, h4);
			append_hydration(h4, t3);
			append_hydration(div1, t4);
			append_hydration(div1, p);
			append_hydration(p, t5);
			append_hydration(div2, t6);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div2);
		}
	};
}

// (858:4) {#each features as feature, index}
function create_each_block(ctx) {
	let div1;
	let div0;
	let t0_value = /*feature*/ ctx[13].icon + "";
	let t0;
	let t1;
	let h3;
	let t2_value = /*feature*/ ctx[13].title + "";
	let t2;
	let t3;
	let p;
	let t4_value = /*feature*/ ctx[13].description + "";
	let t4;
	let t5;

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			h3 = element("h3");
			t2 = text(t2_value);
			t3 = space();
			p = element("p");
			t4 = text(t4_value);
			t5 = space();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true, style: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, t0_value);
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t2 = claim_text(h3_nodes, t2_value);
			h3_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t4 = claim_text(p_nodes, t4_value);
			p_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "feature-icon svelte-128jgpb");
			attr(h3, "class", "svelte-128jgpb");
			attr(p, "class", "svelte-128jgpb");
			attr(div1, "class", "feature-card svelte-128jgpb");
			set_style(div1, "animation-delay", /*index*/ ctx[15] * 100 + "ms");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, h3);
			append_hydration(h3, t2);
			append_hydration(div1, t3);
			append_hydration(div1, p);
			append_hydration(p, t4);
			append_hydration(div1, t5);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

function create_fragment(ctx) {
	let section0;
	let div1;
	let div0;
	let t0;
	let div17;
	let div2;
	let span0;
	let t1;
	let t2;
	let span1;
	let t3;
	let t4;
	let h1;
	let t5;
	let span2;
	let t6;
	let t7;
	let p0;
	let t8;
	let t9;
	let div15;
	let div5;
	let div3;
	let t10_value = /*courseStats*/ ctx[2].totalWeeks + "";
	let t10;
	let t11;
	let div4;
	let t12;
	let t13;
	let div8;
	let div6;
	let t14_value = /*courseStats*/ ctx[2].modules + "";
	let t14;
	let t15;
	let div7;
	let t16;
	let t17;
	let div11;
	let div9;
	let t18_value = /*courseStats*/ ctx[2].ageGroups + "";
	let t18;
	let t19;
	let div10;
	let t20;
	let t21;
	let div14;
	let div12;
	let t22_value = /*courseStats*/ ctx[2].quizzes + /*courseStats*/ ctx[2].tests + "";
	let t22;
	let t23;
	let div13;
	let t24;
	let div15_class_value;
	let t25;
	let div16;
	let button0;
	let span3;
	let t26;
	let t27;
	let t28;
	let button1;
	let span4;
	let t29;
	let t30;
	let t31;
	let section1;
	let div18;
	let h20;
	let t32;
	let t33;
	let p1;
	let t34;
	let t35;
	let div19;
	let t36;
	let section2;
	let div20;
	let h21;
	let t37;
	let t38;
	let p2;
	let t39;
	let t40;
	let div21;
	let t41;
	let section3;
	let div22;
	let h22;
	let t42;
	let t43;
	let p3;
	let t44;
	let t45;
	let div23;
	let t46;
	let section4;
	let div24;
	let h23;
	let t47;
	let t48;
	let p4;
	let t49;
	let t50;
	let div25;
	let t51;
	let section5;
	let div27;
	let h24;
	let t52;
	let t53;
	let p5;
	let t54;
	let t55;
	let div26;
	let button2;
	let t56;
	let t57;
	let button3;
	let t58;
	let mounted;
	let dispose;
	let each_value_3 = /*modules*/ ctx[3];
	let each_blocks_3 = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks_3[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	let each_value_2 = /*ageGroups*/ ctx[4];
	let each_blocks_2 = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let each_value_1 = /*assessmentSchedule*/ ctx[5];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*features*/ ctx[6];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			section0 = element("section");
			div1 = element("div");
			div0 = element("div");
			t0 = space();
			div17 = element("div");
			div2 = element("div");
			span0 = element("span");
			t1 = text("🎓");
			t2 = space();
			span1 = element("span");
			t3 = text("ICDL Certified Course");
			t4 = space();
			h1 = element("h1");
			t5 = text("Master Digital Literacy with \n      ");
			span2 = element("span");
			t6 = text("Confidence");
			t7 = space();
			p0 = element("p");
			t8 = text("A comprehensive 12-week journey through essential computer skills designed specifically \n      for students aged 10-17. Interactive lessons, hands-on activities, and expert teacher support.");
			t9 = space();
			div15 = element("div");
			div5 = element("div");
			div3 = element("div");
			t10 = text(t10_value);
			t11 = space();
			div4 = element("div");
			t12 = text("Weeks");
			t13 = space();
			div8 = element("div");
			div6 = element("div");
			t14 = text(t14_value);
			t15 = space();
			div7 = element("div");
			t16 = text("Modules");
			t17 = space();
			div11 = element("div");
			div9 = element("div");
			t18 = text(t18_value);
			t19 = space();
			div10 = element("div");
			t20 = text("Age Groups");
			t21 = space();
			div14 = element("div");
			div12 = element("div");
			t22 = text(t22_value);
			t23 = space();
			div13 = element("div");
			t24 = text("Assessments");
			t25 = space();
			div16 = element("div");
			button0 = element("button");
			span3 = element("span");
			t26 = text("🚀");
			t27 = text("\n        Start Teaching");
			t28 = space();
			button1 = element("button");
			span4 = element("span");
			t29 = text("📝");
			t30 = text("\n        View Assessments");
			t31 = space();
			section1 = element("section");
			div18 = element("div");
			h20 = element("h2");
			t32 = text("Course Modules");
			t33 = space();
			p1 = element("p");
			t34 = text("Four comprehensive modules covering all essential digital literacy skills");
			t35 = space();
			div19 = element("div");

			for (let i = 0; i < each_blocks_3.length; i += 1) {
				each_blocks_3[i].c();
			}

			t36 = space();
			section2 = element("section");
			div20 = element("div");
			h21 = element("h2");
			t37 = text("Tailored for Every Age Group");
			t38 = space();
			p2 = element("p");
			t39 = text("Specialized approaches designed for different developmental stages and learning preferences");
			t40 = space();
			div21 = element("div");

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].c();
			}

			t41 = space();
			section3 = element("section");
			div22 = element("div");
			h22 = element("h2");
			t42 = text("Assessment Schedule");
			t43 = space();
			p3 = element("p");
			t44 = text("Regular evaluation to ensure student progress and understanding");
			t45 = space();
			div23 = element("div");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t46 = space();
			section4 = element("section");
			div24 = element("div");
			h23 = element("h2");
			t47 = text("Why Choose Our ICDL Course?");
			t48 = space();
			p4 = element("p");
			t49 = text("Comprehensive support for both teachers and students");
			t50 = space();
			div25 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t51 = space();
			section5 = element("section");
			div27 = element("div");
			h24 = element("h2");
			t52 = text("Ready to Transform Digital Learning?");
			t53 = space();
			p5 = element("p");
			t54 = text("Join thousands of educators using our comprehensive ICDL curriculum");
			t55 = space();
			div26 = element("div");
			button2 = element("button");
			t56 = text("Get Started Now");
			t57 = space();
			button3 = element("button");
			t58 = text("View Sample Lessons");
			this.h();
		},
		l(nodes) {
			section0 = claim_element(nodes, "SECTION", { class: true });
			var section0_nodes = children(section0);
			div1 = claim_element(section0_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			children(div0).forEach(detach);
			div1_nodes.forEach(detach);
			t0 = claim_space(section0_nodes);
			div17 = claim_element(section0_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			div2 = claim_element(div17_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			span0 = claim_element(div2_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t1 = claim_text(span0_nodes, "🎓");
			span0_nodes.forEach(detach);
			t2 = claim_space(div2_nodes);
			span1 = claim_element(div2_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t3 = claim_text(span1_nodes, "ICDL Certified Course");
			span1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t4 = claim_space(div17_nodes);
			h1 = claim_element(div17_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t5 = claim_text(h1_nodes, "Master Digital Literacy with \n      ");
			span2 = claim_element(h1_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t6 = claim_text(span2_nodes, "Confidence");
			span2_nodes.forEach(detach);
			h1_nodes.forEach(detach);
			t7 = claim_space(div17_nodes);
			p0 = claim_element(div17_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t8 = claim_text(p0_nodes, "A comprehensive 12-week journey through essential computer skills designed specifically \n      for students aged 10-17. Interactive lessons, hands-on activities, and expert teacher support.");
			p0_nodes.forEach(detach);
			t9 = claim_space(div17_nodes);
			div15 = claim_element(div17_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div5 = claim_element(div15_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			t10 = claim_text(div3_nodes, t10_value);
			div3_nodes.forEach(detach);
			t11 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			t12 = claim_text(div4_nodes, "Weeks");
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t13 = claim_space(div15_nodes);
			div8 = claim_element(div15_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div6 = claim_element(div8_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			t14 = claim_text(div6_nodes, t14_value);
			div6_nodes.forEach(detach);
			t15 = claim_space(div8_nodes);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			t16 = claim_text(div7_nodes, "Modules");
			div7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t17 = claim_space(div15_nodes);
			div11 = claim_element(div15_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			div9 = claim_element(div11_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			t18 = claim_text(div9_nodes, t18_value);
			div9_nodes.forEach(detach);
			t19 = claim_space(div11_nodes);
			div10 = claim_element(div11_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			t20 = claim_text(div10_nodes, "Age Groups");
			div10_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			t21 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			div12 = claim_element(div14_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			t22 = claim_text(div12_nodes, t22_value);
			div12_nodes.forEach(detach);
			t23 = claim_space(div14_nodes);
			div13 = claim_element(div14_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			t24 = claim_text(div13_nodes, "Assessments");
			div13_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			t25 = claim_space(div17_nodes);
			div16 = claim_element(div17_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			button0 = claim_element(div16_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			span3 = claim_element(button0_nodes, "SPAN", { class: true });
			var span3_nodes = children(span3);
			t26 = claim_text(span3_nodes, "🚀");
			span3_nodes.forEach(detach);
			t27 = claim_text(button0_nodes, "\n        Start Teaching");
			button0_nodes.forEach(detach);
			t28 = claim_space(div16_nodes);
			button1 = claim_element(div16_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			span4 = claim_element(button1_nodes, "SPAN", { class: true });
			var span4_nodes = children(span4);
			t29 = claim_text(span4_nodes, "📝");
			span4_nodes.forEach(detach);
			t30 = claim_text(button1_nodes, "\n        View Assessments");
			button1_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			div17_nodes.forEach(detach);
			section0_nodes.forEach(detach);
			t31 = claim_space(nodes);
			section1 = claim_element(nodes, "SECTION", { class: true });
			var section1_nodes = children(section1);
			div18 = claim_element(section1_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			h20 = claim_element(div18_nodes, "H2", { class: true });
			var h20_nodes = children(h20);
			t32 = claim_text(h20_nodes, "Course Modules");
			h20_nodes.forEach(detach);
			t33 = claim_space(div18_nodes);
			p1 = claim_element(div18_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t34 = claim_text(p1_nodes, "Four comprehensive modules covering all essential digital literacy skills");
			p1_nodes.forEach(detach);
			div18_nodes.forEach(detach);
			t35 = claim_space(section1_nodes);
			div19 = claim_element(section1_nodes, "DIV", { class: true });
			var div19_nodes = children(div19);

			for (let i = 0; i < each_blocks_3.length; i += 1) {
				each_blocks_3[i].l(div19_nodes);
			}

			div19_nodes.forEach(detach);
			section1_nodes.forEach(detach);
			t36 = claim_space(nodes);
			section2 = claim_element(nodes, "SECTION", { class: true });
			var section2_nodes = children(section2);
			div20 = claim_element(section2_nodes, "DIV", { class: true });
			var div20_nodes = children(div20);
			h21 = claim_element(div20_nodes, "H2", { class: true });
			var h21_nodes = children(h21);
			t37 = claim_text(h21_nodes, "Tailored for Every Age Group");
			h21_nodes.forEach(detach);
			t38 = claim_space(div20_nodes);
			p2 = claim_element(div20_nodes, "P", { class: true });
			var p2_nodes = children(p2);
			t39 = claim_text(p2_nodes, "Specialized approaches designed for different developmental stages and learning preferences");
			p2_nodes.forEach(detach);
			div20_nodes.forEach(detach);
			t40 = claim_space(section2_nodes);
			div21 = claim_element(section2_nodes, "DIV", { class: true });
			var div21_nodes = children(div21);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].l(div21_nodes);
			}

			div21_nodes.forEach(detach);
			section2_nodes.forEach(detach);
			t41 = claim_space(nodes);
			section3 = claim_element(nodes, "SECTION", { class: true });
			var section3_nodes = children(section3);
			div22 = claim_element(section3_nodes, "DIV", { class: true });
			var div22_nodes = children(div22);
			h22 = claim_element(div22_nodes, "H2", { class: true });
			var h22_nodes = children(h22);
			t42 = claim_text(h22_nodes, "Assessment Schedule");
			h22_nodes.forEach(detach);
			t43 = claim_space(div22_nodes);
			p3 = claim_element(div22_nodes, "P", { class: true });
			var p3_nodes = children(p3);
			t44 = claim_text(p3_nodes, "Regular evaluation to ensure student progress and understanding");
			p3_nodes.forEach(detach);
			div22_nodes.forEach(detach);
			t45 = claim_space(section3_nodes);
			div23 = claim_element(section3_nodes, "DIV", { class: true });
			var div23_nodes = children(div23);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(div23_nodes);
			}

			div23_nodes.forEach(detach);
			section3_nodes.forEach(detach);
			t46 = claim_space(nodes);
			section4 = claim_element(nodes, "SECTION", { class: true });
			var section4_nodes = children(section4);
			div24 = claim_element(section4_nodes, "DIV", { class: true });
			var div24_nodes = children(div24);
			h23 = claim_element(div24_nodes, "H2", { class: true });
			var h23_nodes = children(h23);
			t47 = claim_text(h23_nodes, "Why Choose Our ICDL Course?");
			h23_nodes.forEach(detach);
			t48 = claim_space(div24_nodes);
			p4 = claim_element(div24_nodes, "P", { class: true });
			var p4_nodes = children(p4);
			t49 = claim_text(p4_nodes, "Comprehensive support for both teachers and students");
			p4_nodes.forEach(detach);
			div24_nodes.forEach(detach);
			t50 = claim_space(section4_nodes);
			div25 = claim_element(section4_nodes, "DIV", { class: true });
			var div25_nodes = children(div25);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div25_nodes);
			}

			div25_nodes.forEach(detach);
			section4_nodes.forEach(detach);
			t51 = claim_space(nodes);
			section5 = claim_element(nodes, "SECTION", { class: true });
			var section5_nodes = children(section5);
			div27 = claim_element(section5_nodes, "DIV", { class: true });
			var div27_nodes = children(div27);
			h24 = claim_element(div27_nodes, "H2", { class: true });
			var h24_nodes = children(h24);
			t52 = claim_text(h24_nodes, "Ready to Transform Digital Learning?");
			h24_nodes.forEach(detach);
			t53 = claim_space(div27_nodes);
			p5 = claim_element(div27_nodes, "P", { class: true });
			var p5_nodes = children(p5);
			t54 = claim_text(p5_nodes, "Join thousands of educators using our comprehensive ICDL curriculum");
			p5_nodes.forEach(detach);
			t55 = claim_space(div27_nodes);
			div26 = claim_element(div27_nodes, "DIV", { class: true });
			var div26_nodes = children(div26);
			button2 = claim_element(div26_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t56 = claim_text(button2_nodes, "Get Started Now");
			button2_nodes.forEach(detach);
			t57 = claim_space(div26_nodes);
			button3 = claim_element(div26_nodes, "BUTTON", { class: true });
			var button3_nodes = children(button3);
			t58 = claim_text(button3_nodes, "View Sample Lessons");
			button3_nodes.forEach(detach);
			div26_nodes.forEach(detach);
			div27_nodes.forEach(detach);
			section5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "hero-pattern svelte-128jgpb");
			attr(div1, "class", "hero-background svelte-128jgpb");
			attr(span0, "class", "badge-icon");
			attr(span1, "class", "badge-text");
			attr(div2, "class", "hero-badge svelte-128jgpb");
			attr(span2, "class", "highlight svelte-128jgpb");
			attr(h1, "class", "hero-title svelte-128jgpb");
			attr(p0, "class", "hero-description svelte-128jgpb");
			attr(div3, "class", "stat-number svelte-128jgpb");
			attr(div4, "class", "stat-label svelte-128jgpb");
			attr(div5, "class", "stat-item svelte-128jgpb");
			attr(div6, "class", "stat-number svelte-128jgpb");
			attr(div7, "class", "stat-label svelte-128jgpb");
			attr(div8, "class", "stat-item svelte-128jgpb");
			attr(div9, "class", "stat-number svelte-128jgpb");
			attr(div10, "class", "stat-label svelte-128jgpb");
			attr(div11, "class", "stat-item svelte-128jgpb");
			attr(div12, "class", "stat-number svelte-128jgpb");
			attr(div13, "class", "stat-label svelte-128jgpb");
			attr(div14, "class", "stat-item svelte-128jgpb");
			attr(div15, "class", div15_class_value = "hero-stats " + (/*statsVisible*/ ctx[1] ? 'animate' : '') + " svelte-128jgpb");
			attr(span3, "class", "btn-icon svelte-128jgpb");
			attr(button0, "class", "btn btn-primary btn-lg svelte-128jgpb");
			attr(span4, "class", "btn-icon svelte-128jgpb");
			attr(button1, "class", "btn btn-secondary btn-lg svelte-128jgpb");
			attr(div16, "class", "hero-actions svelte-128jgpb");
			attr(div17, "class", "hero-content svelte-128jgpb");
			attr(section0, "class", "hero svelte-128jgpb");
			attr(h20, "class", "svelte-128jgpb");
			attr(p1, "class", "svelte-128jgpb");
			attr(div18, "class", "section-header svelte-128jgpb");
			attr(div19, "class", "modules-grid svelte-128jgpb");
			attr(section1, "class", "modules-section svelte-128jgpb");
			attr(h21, "class", "svelte-128jgpb");
			attr(p2, "class", "svelte-128jgpb");
			attr(div20, "class", "section-header svelte-128jgpb");
			attr(div21, "class", "age-groups-grid svelte-128jgpb");
			attr(section2, "class", "age-groups-section svelte-128jgpb");
			attr(h22, "class", "svelte-128jgpb");
			attr(p3, "class", "svelte-128jgpb");
			attr(div22, "class", "section-header svelte-128jgpb");
			attr(div23, "class", "timeline svelte-128jgpb");
			attr(section3, "class", "assessment-section svelte-128jgpb");
			attr(h23, "class", "svelte-128jgpb");
			attr(p4, "class", "svelte-128jgpb");
			attr(div24, "class", "section-header svelte-128jgpb");
			attr(div25, "class", "features-grid svelte-128jgpb");
			attr(section4, "class", "features-section svelte-128jgpb");
			attr(h24, "class", "svelte-128jgpb");
			attr(p5, "class", "svelte-128jgpb");
			attr(button2, "class", "btn btn-primary btn-lg svelte-128jgpb");
			attr(button3, "class", "btn btn-outline btn-lg svelte-128jgpb");
			attr(div26, "class", "cta-actions svelte-128jgpb");
			attr(div27, "class", "cta-content svelte-128jgpb");
			attr(section5, "class", "cta-section svelte-128jgpb");
		},
		m(target, anchor) {
			insert_hydration(target, section0, anchor);
			append_hydration(section0, div1);
			append_hydration(div1, div0);
			append_hydration(section0, t0);
			append_hydration(section0, div17);
			append_hydration(div17, div2);
			append_hydration(div2, span0);
			append_hydration(span0, t1);
			append_hydration(div2, t2);
			append_hydration(div2, span1);
			append_hydration(span1, t3);
			append_hydration(div17, t4);
			append_hydration(div17, h1);
			append_hydration(h1, t5);
			append_hydration(h1, span2);
			append_hydration(span2, t6);
			append_hydration(div17, t7);
			append_hydration(div17, p0);
			append_hydration(p0, t8);
			append_hydration(div17, t9);
			append_hydration(div17, div15);
			append_hydration(div15, div5);
			append_hydration(div5, div3);
			append_hydration(div3, t10);
			append_hydration(div5, t11);
			append_hydration(div5, div4);
			append_hydration(div4, t12);
			append_hydration(div15, t13);
			append_hydration(div15, div8);
			append_hydration(div8, div6);
			append_hydration(div6, t14);
			append_hydration(div8, t15);
			append_hydration(div8, div7);
			append_hydration(div7, t16);
			append_hydration(div15, t17);
			append_hydration(div15, div11);
			append_hydration(div11, div9);
			append_hydration(div9, t18);
			append_hydration(div11, t19);
			append_hydration(div11, div10);
			append_hydration(div10, t20);
			append_hydration(div15, t21);
			append_hydration(div15, div14);
			append_hydration(div14, div12);
			append_hydration(div12, t22);
			append_hydration(div14, t23);
			append_hydration(div14, div13);
			append_hydration(div13, t24);
			append_hydration(div17, t25);
			append_hydration(div17, div16);
			append_hydration(div16, button0);
			append_hydration(button0, span3);
			append_hydration(span3, t26);
			append_hydration(button0, t27);
			append_hydration(div16, t28);
			append_hydration(div16, button1);
			append_hydration(button1, span4);
			append_hydration(span4, t29);
			append_hydration(button1, t30);
			insert_hydration(target, t31, anchor);
			insert_hydration(target, section1, anchor);
			append_hydration(section1, div18);
			append_hydration(div18, h20);
			append_hydration(h20, t32);
			append_hydration(div18, t33);
			append_hydration(div18, p1);
			append_hydration(p1, t34);
			append_hydration(section1, t35);
			append_hydration(section1, div19);

			for (let i = 0; i < each_blocks_3.length; i += 1) {
				if (each_blocks_3[i]) {
					each_blocks_3[i].m(div19, null);
				}
			}

			insert_hydration(target, t36, anchor);
			insert_hydration(target, section2, anchor);
			append_hydration(section2, div20);
			append_hydration(div20, h21);
			append_hydration(h21, t37);
			append_hydration(div20, t38);
			append_hydration(div20, p2);
			append_hydration(p2, t39);
			append_hydration(section2, t40);
			append_hydration(section2, div21);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				if (each_blocks_2[i]) {
					each_blocks_2[i].m(div21, null);
				}
			}

			insert_hydration(target, t41, anchor);
			insert_hydration(target, section3, anchor);
			append_hydration(section3, div22);
			append_hydration(div22, h22);
			append_hydration(h22, t42);
			append_hydration(div22, t43);
			append_hydration(div22, p3);
			append_hydration(p3, t44);
			append_hydration(section3, t45);
			append_hydration(section3, div23);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(div23, null);
				}
			}

			insert_hydration(target, t46, anchor);
			insert_hydration(target, section4, anchor);
			append_hydration(section4, div24);
			append_hydration(div24, h23);
			append_hydration(h23, t47);
			append_hydration(div24, t48);
			append_hydration(div24, p4);
			append_hydration(p4, t49);
			append_hydration(section4, t50);
			append_hydration(section4, div25);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div25, null);
				}
			}

			insert_hydration(target, t51, anchor);
			insert_hydration(target, section5, anchor);
			append_hydration(section5, div27);
			append_hydration(div27, h24);
			append_hydration(h24, t52);
			append_hydration(div27, t53);
			append_hydration(div27, p5);
			append_hydration(p5, t54);
			append_hydration(div27, t55);
			append_hydration(div27, div26);
			append_hydration(div26, button2);
			append_hydration(button2, t56);
			append_hydration(div26, t57);
			append_hydration(div26, button3);
			append_hydration(button3, t58);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[8]),
					listen(button1, "click", /*click_handler_1*/ ctx[9]),
					listen(button2, "click", /*click_handler_3*/ ctx[11]),
					listen(button3, "click", /*click_handler_4*/ ctx[12])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*statsVisible*/ 2 && div15_class_value !== (div15_class_value = "hero-stats " + (/*statsVisible*/ ctx[1] ? 'animate' : '') + " svelte-128jgpb")) {
				attr(div15, "class", div15_class_value);
			}

			if (dirty & /*modules, onNavigate*/ 9) {
				each_value_3 = /*modules*/ ctx[3];
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks_3[i]) {
						each_blocks_3[i].p(child_ctx, dirty);
					} else {
						each_blocks_3[i] = create_each_block_3(child_ctx);
						each_blocks_3[i].c();
						each_blocks_3[i].m(div19, null);
					}
				}

				for (; i < each_blocks_3.length; i += 1) {
					each_blocks_3[i].d(1);
				}

				each_blocks_3.length = each_value_3.length;
			}

			if (dirty & /*ageGroups*/ 16) {
				each_value_2 = /*ageGroups*/ ctx[4];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks_2[i]) {
						each_blocks_2[i].p(child_ctx, dirty);
					} else {
						each_blocks_2[i] = create_each_block_2(child_ctx);
						each_blocks_2[i].c();
						each_blocks_2[i].m(div21, null);
					}
				}

				for (; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].d(1);
				}

				each_blocks_2.length = each_value_2.length;
			}

			if (dirty & /*assessmentSchedule*/ 32) {
				each_value_1 = /*assessmentSchedule*/ ctx[5];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(div23, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*features*/ 64) {
				each_value = /*features*/ ctx[6];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div25, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(section0);
			if (detaching) detach(t31);
			if (detaching) detach(section1);
			destroy_each(each_blocks_3, detaching);
			if (detaching) detach(t36);
			if (detaching) detach(section2);
			destroy_each(each_blocks_2, detaching);
			if (detaching) detach(t41);
			if (detaching) detach(section3);
			destroy_each(each_blocks_1, detaching);
			if (detaching) detach(t46);
			if (detaching) detach(section4);
			destroy_each(each_blocks, detaching);
			if (detaching) detach(t51);
			if (detaching) detach(section5);
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;
	let { onNavigate } = $$props;

	// Course statistics
	const courseStats = {
		totalWeeks: 12,
		modules: 4,
		quizzes: 3,
		tests: 3,
		ageGroups: 3
	};

	// Module details with enhanced information
	const modules = [
		{
			id: 'computer-essentials',
			title: 'Computer Essentials',
			icon: '💻',
			description: 'Learn about computers, operating systems, file management, and basic maintenance.',
			weeks: 'Weeks 1-4',
			topics: [
				'Computer Basics',
				'File Management',
				'Hardware & Software',
				'System Maintenance'
			],
			difficulty: 'Beginner',
			color: 'blue'
		},
		{
			id: 'online-essentials',
			title: 'Online Essentials',
			icon: '🌐',
			description: 'Master internet browsing, email, online safety, and digital citizenship.',
			weeks: 'Weeks 5-8',
			topics: [
				'Web Browsing',
				'Email & Communication',
				'Online Safety',
				'Information Search'
			],
			difficulty: 'Beginner',
			color: 'green'
		},
		{
			id: 'word-processing',
			title: 'Word Processing',
			icon: '📄',
			description: 'Create and format documents, use styles, and master text editing tools.',
			weeks: 'Weeks 9-10',
			topics: ['Document Creation', 'Formatting & Styles', 'Advanced Features'],
			difficulty: 'Intermediate',
			color: 'purple'
		},
		{
			id: 'spreadsheets',
			title: 'Spreadsheets',
			icon: '📊',
			description: 'Work with data, create charts, use formulas, and organize information.',
			weeks: 'Weeks 11-12',
			topics: ['Data Entry', 'Formulas & Functions', 'Charts & Visualization'],
			difficulty: 'Intermediate',
			color: 'orange'
		}
	];

	// Age group information
	const ageGroups = [
		{
			name: 'Group A',
			ages: '10-13 years',
			description: 'Mixed gender group with focus on visual learning and hands-on activities',
			approach: 'Interactive games, colorful visuals, step-by-step guidance',
			icon: '🎮'
		},
		{
			name: 'Group B',
			ages: '14-17 years (Males)',
			description: 'Practical applications and problem-solving challenges',
			approach: 'Real-world scenarios, technical challenges, competitive elements',
			icon: '⚡'
		},
		{
			name: 'Group C',
			ages: '14-17 years (Females)',
			description: 'Collaborative projects and creative applications',
			approach: 'Group work, creative projects, social learning activities',
			icon: '✨'
		}
	];

	// Assessment schedule
	const assessmentSchedule = [
		{
			week: 2,
			type: 'Quiz 1',
			module: 'Computer Essentials'
		},
		{
			week: 4,
			type: 'Test 1',
			module: 'Computer Essentials'
		},
		{
			week: 6,
			type: 'Quiz 2',
			module: 'Online Essentials'
		},
		{
			week: 8,
			type: 'Test 2',
			module: 'Online Essentials'
		},
		{
			week: 10,
			type: 'Quiz 3',
			module: 'Word Processing'
		},
		{
			week: 12,
			type: 'Final Test',
			module: 'All Modules'
		}
	];

	// Feature highlights
	const features = [
		{
			icon: '👨‍🏫',
			title: 'Teacher Support',
			description: 'Comprehensive teacher notes and lesson plans for every session'
		},
		{
			icon: '🎯',
			title: 'Age-Appropriate',
			description: 'Tailored content and activities for different age groups'
		},
		{
			icon: '📋',
			title: 'Printable Assessments',
			description: 'A4-optimized quizzes and tests ready for classroom use'
		},
		{
			icon: '🎲',
			title: 'Interactive Activities',
			description: 'Engaging icebreakers and mind games for each lesson'
		}
	];

	// Quick stats animation trigger
	let statsVisible = false;

	onMount(() => {
		setTimeout(
			() => {
				$$invalidate(1, statsVisible = true);
			},
			500
		);
	});

	const click_handler = () => onNavigate('course');
	const click_handler_1 = () => onNavigate('quizzes');
	const click_handler_2 = () => onNavigate('course');
	const click_handler_3 = () => onNavigate('course');
	const click_handler_4 = () => onNavigate('progress');

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(7, props = $$props.props);
		if ('onNavigate' in $$props) $$invalidate(0, onNavigate = $$props.onNavigate);
	};

	return [
		onNavigate,
		statsVisible,
		courseStats,
		modules,
		ageGroups,
		assessmentSchedule,
		features,
		props,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 7, onNavigate: 0 });
	}
}

export { Component as default };
