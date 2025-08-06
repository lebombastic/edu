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
function empty() {
    return text('');
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
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}

let current_component;
function set_current_component(component) {
    current_component = component;
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
	child_ctx[17] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[20] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

// (304:2) {#if activeView === 'home'}
function create_if_block_4(ctx) {
	let section;
	let div12;
	let h2;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div5;
	let h30;
	let t4;
	let t5;
	let div4;
	let div0;
	let h40;
	let t6;
	let t7;
	let p1;
	let t8;
	let t9;
	let div1;
	let h41;
	let t10;
	let t11;
	let p2;
	let t12;
	let t13;
	let div2;
	let h42;
	let t14;
	let t15;
	let p3;
	let t16;
	let t17;
	let div3;
	let h43;
	let t18;
	let t19;
	let p4;
	let t20;
	let t21;
	let div10;
	let h31;
	let t22;
	let t23;
	let div9;
	let div6;
	let h44;
	let t24;
	let t25;
	let p5;
	let t26;
	let t27;
	let div7;
	let h45;
	let t28;
	let t29;
	let p6;
	let t30;
	let t31;
	let div8;
	let h46;
	let t32;
	let t33;
	let p7;
	let t34;
	let t35;
	let div11;
	let h32;
	let t36;
	let t37;
	let button0;
	let t38;
	let t39;
	let button1;
	let t40;
	let mounted;
	let dispose;

	return {
		c() {
			section = element("section");
			div12 = element("div");
			h2 = element("h2");
			t0 = text("Welcome to Your ICDL Journey");
			t1 = space();
			p0 = element("p");
			t2 = text("Master essential digital skills in 12 weeks");
			t3 = space();
			div5 = element("div");
			h30 = element("h3");
			t4 = text("Course Modules");
			t5 = space();
			div4 = element("div");
			div0 = element("div");
			h40 = element("h4");
			t6 = text("Computer Essentials");
			t7 = space();
			p1 = element("p");
			t8 = text("Weeks 1-2: Master the fundamentals of computers and operating systems");
			t9 = space();
			div1 = element("div");
			h41 = element("h4");
			t10 = text("Online Essentials");
			t11 = space();
			p2 = element("p");
			t12 = text("Weeks 3-4: Navigate the internet safely and effectively");
			t13 = space();
			div2 = element("div");
			h42 = element("h4");
			t14 = text("Word Processing");
			t15 = space();
			p3 = element("p");
			t16 = text("Weeks 5-8: Create professional documents with advanced formatting");
			t17 = space();
			div3 = element("div");
			h43 = element("h4");
			t18 = text("Spreadsheets");
			t19 = space();
			p4 = element("p");
			t20 = text("Weeks 9-12: Analyze data and create powerful calculations");
			t21 = space();
			div10 = element("div");
			h31 = element("h3");
			t22 = text("Designed for Three Learning Groups");
			t23 = space();
			div9 = element("div");
			div6 = element("div");
			h44 = element("h4");
			t24 = text("Group A (10-13 years)");
			t25 = space();
			p5 = element("p");
			t26 = text("Interactive, game-based learning approach");
			t27 = space();
			div7 = element("div");
			h45 = element("h4");
			t28 = text("Group B (14-17 years, Males)");
			t29 = space();
			p6 = element("p");
			t30 = text("Project-focused, competitive challenges");
			t31 = space();
			div8 = element("div");
			h46 = element("h4");
			t32 = text("Group C (14-17 years, Females)");
			t33 = space();
			p7 = element("p");
			t34 = text("Collaborative, creative applications");
			t35 = space();
			div11 = element("div");
			h32 = element("h3");
			t36 = text("Quick Start");
			t37 = space();
			button0 = element("button");
			t38 = text("Start Week 1");
			t39 = space();
			button1 = element("button");
			t40 = text("View Assessments");
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div12 = claim_element(section_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			h2 = claim_element(div12_nodes, "H2", {});
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Welcome to Your ICDL Journey");
			h2_nodes.forEach(detach);
			t1 = claim_space(div12_nodes);
			p0 = claim_element(div12_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Master essential digital skills in 12 weeks");
			p0_nodes.forEach(detach);
			t3 = claim_space(div12_nodes);
			div5 = claim_element(div12_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h30 = claim_element(div5_nodes, "H3", {});
			var h30_nodes = children(h30);
			t4 = claim_text(h30_nodes, "Course Modules");
			h30_nodes.forEach(detach);
			t5 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h40 = claim_element(div0_nodes, "H4", {});
			var h40_nodes = children(h40);
			t6 = claim_text(h40_nodes, "Computer Essentials");
			h40_nodes.forEach(detach);
			t7 = claim_space(div0_nodes);
			p1 = claim_element(div0_nodes, "P", {});
			var p1_nodes = children(p1);
			t8 = claim_text(p1_nodes, "Weeks 1-2: Master the fundamentals of computers and operating systems");
			p1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t9 = claim_space(div4_nodes);
			div1 = claim_element(div4_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h41 = claim_element(div1_nodes, "H4", {});
			var h41_nodes = children(h41);
			t10 = claim_text(h41_nodes, "Online Essentials");
			h41_nodes.forEach(detach);
			t11 = claim_space(div1_nodes);
			p2 = claim_element(div1_nodes, "P", {});
			var p2_nodes = children(p2);
			t12 = claim_text(p2_nodes, "Weeks 3-4: Navigate the internet safely and effectively");
			p2_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t13 = claim_space(div4_nodes);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h42 = claim_element(div2_nodes, "H4", {});
			var h42_nodes = children(h42);
			t14 = claim_text(h42_nodes, "Word Processing");
			h42_nodes.forEach(detach);
			t15 = claim_space(div2_nodes);
			p3 = claim_element(div2_nodes, "P", {});
			var p3_nodes = children(p3);
			t16 = claim_text(p3_nodes, "Weeks 5-8: Create professional documents with advanced formatting");
			p3_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t17 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h43 = claim_element(div3_nodes, "H4", {});
			var h43_nodes = children(h43);
			t18 = claim_text(h43_nodes, "Spreadsheets");
			h43_nodes.forEach(detach);
			t19 = claim_space(div3_nodes);
			p4 = claim_element(div3_nodes, "P", {});
			var p4_nodes = children(p4);
			t20 = claim_text(p4_nodes, "Weeks 9-12: Analyze data and create powerful calculations");
			p4_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t21 = claim_space(div12_nodes);
			div10 = claim_element(div12_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			h31 = claim_element(div10_nodes, "H3", {});
			var h31_nodes = children(h31);
			t22 = claim_text(h31_nodes, "Designed for Three Learning Groups");
			h31_nodes.forEach(detach);
			t23 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			div6 = claim_element(div9_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			h44 = claim_element(div6_nodes, "H4", {});
			var h44_nodes = children(h44);
			t24 = claim_text(h44_nodes, "Group A (10-13 years)");
			h44_nodes.forEach(detach);
			t25 = claim_space(div6_nodes);
			p5 = claim_element(div6_nodes, "P", {});
			var p5_nodes = children(p5);
			t26 = claim_text(p5_nodes, "Interactive, game-based learning approach");
			p5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t27 = claim_space(div9_nodes);
			div7 = claim_element(div9_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			h45 = claim_element(div7_nodes, "H4", {});
			var h45_nodes = children(h45);
			t28 = claim_text(h45_nodes, "Group B (14-17 years, Males)");
			h45_nodes.forEach(detach);
			t29 = claim_space(div7_nodes);
			p6 = claim_element(div7_nodes, "P", {});
			var p6_nodes = children(p6);
			t30 = claim_text(p6_nodes, "Project-focused, competitive challenges");
			p6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t31 = claim_space(div9_nodes);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			h46 = claim_element(div8_nodes, "H4", {});
			var h46_nodes = children(h46);
			t32 = claim_text(h46_nodes, "Group C (14-17 years, Females)");
			h46_nodes.forEach(detach);
			t33 = claim_space(div8_nodes);
			p7 = claim_element(div8_nodes, "P", {});
			var p7_nodes = children(p7);
			t34 = claim_text(p7_nodes, "Collaborative, creative applications");
			p7_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t35 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			h32 = claim_element(div11_nodes, "H3", {});
			var h32_nodes = children(h32);
			t36 = claim_text(h32_nodes, "Quick Start");
			h32_nodes.forEach(detach);
			t37 = claim_space(div11_nodes);
			button0 = claim_element(div11_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t38 = claim_text(button0_nodes, "Start Week 1");
			button0_nodes.forEach(detach);
			t39 = claim_space(div11_nodes);
			button1 = claim_element(div11_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t40 = claim_text(button1_nodes, "View Assessments");
			button1_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(p0, "class", "hero-subtitle");
			attr(div0, "class", "module-card svelte-1md9r1h");
			attr(div1, "class", "module-card svelte-1md9r1h");
			attr(div2, "class", "module-card svelte-1md9r1h");
			attr(div3, "class", "module-card svelte-1md9r1h");
			attr(div4, "class", "modules-grid svelte-1md9r1h");
			attr(div5, "class", "course-overview");
			attr(div6, "class", "group-card svelte-1md9r1h");
			attr(div7, "class", "group-card svelte-1md9r1h");
			attr(div8, "class", "group-card svelte-1md9r1h");
			attr(div9, "class", "groups-container svelte-1md9r1h");
			attr(div10, "class", "age-groups");
			attr(button0, "class", "cta-btn svelte-1md9r1h");
			attr(button1, "class", "cta-btn secondary svelte-1md9r1h");
			attr(div11, "class", "quick-start");
			attr(div12, "class", "hero-area");
			attr(section, "class", "home-section");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div12);
			append_hydration(div12, h2);
			append_hydration(h2, t0);
			append_hydration(div12, t1);
			append_hydration(div12, p0);
			append_hydration(p0, t2);
			append_hydration(div12, t3);
			append_hydration(div12, div5);
			append_hydration(div5, h30);
			append_hydration(h30, t4);
			append_hydration(div5, t5);
			append_hydration(div5, div4);
			append_hydration(div4, div0);
			append_hydration(div0, h40);
			append_hydration(h40, t6);
			append_hydration(div0, t7);
			append_hydration(div0, p1);
			append_hydration(p1, t8);
			append_hydration(div4, t9);
			append_hydration(div4, div1);
			append_hydration(div1, h41);
			append_hydration(h41, t10);
			append_hydration(div1, t11);
			append_hydration(div1, p2);
			append_hydration(p2, t12);
			append_hydration(div4, t13);
			append_hydration(div4, div2);
			append_hydration(div2, h42);
			append_hydration(h42, t14);
			append_hydration(div2, t15);
			append_hydration(div2, p3);
			append_hydration(p3, t16);
			append_hydration(div4, t17);
			append_hydration(div4, div3);
			append_hydration(div3, h43);
			append_hydration(h43, t18);
			append_hydration(div3, t19);
			append_hydration(div3, p4);
			append_hydration(p4, t20);
			append_hydration(div12, t21);
			append_hydration(div12, div10);
			append_hydration(div10, h31);
			append_hydration(h31, t22);
			append_hydration(div10, t23);
			append_hydration(div10, div9);
			append_hydration(div9, div6);
			append_hydration(div6, h44);
			append_hydration(h44, t24);
			append_hydration(div6, t25);
			append_hydration(div6, p5);
			append_hydration(p5, t26);
			append_hydration(div9, t27);
			append_hydration(div9, div7);
			append_hydration(div7, h45);
			append_hydration(h45, t28);
			append_hydration(div7, t29);
			append_hydration(div7, p6);
			append_hydration(p6, t30);
			append_hydration(div9, t31);
			append_hydration(div9, div8);
			append_hydration(div8, h46);
			append_hydration(h46, t32);
			append_hydration(div8, t33);
			append_hydration(div8, p7);
			append_hydration(p7, t34);
			append_hydration(div12, t35);
			append_hydration(div12, div11);
			append_hydration(div11, h32);
			append_hydration(h32, t36);
			append_hydration(div11, t37);
			append_hydration(div11, button0);
			append_hydration(button0, t38);
			append_hydration(div11, t39);
			append_hydration(div11, button1);
			append_hydration(button1, t40);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_3*/ ctx[12]),
					listen(button1, "click", /*click_handler_4*/ ctx[13])
				];

				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(section);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (363:2) {#if activeView === 'course'}
function create_if_block_2(ctx) {
	let section;
	let div0;
	let h3;
	let t0;
	let t1;
	let ul;
	let t2;
	let div1;
	let each_value_3 = /*courseWeeks*/ ctx[3];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks_1[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	let each_value_2 = /*courseWeeks*/ ctx[3];
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	return {
		c() {
			section = element("section");
			div0 = element("div");
			h3 = element("h3");
			t0 = text("Course Weeks");
			t1 = space();
			ul = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t2 = space();
			div1 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div0 = claim_element(section_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h3 = claim_element(div0_nodes, "H3", {});
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Course Weeks");
			h3_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			ul = claim_element(div0_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t2 = claim_space(section_nodes);
			div1 = claim_element(section_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div1_nodes);
			}

			div1_nodes.forEach(detach);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(ul, "class", "week-list svelte-1md9r1h");
			attr(div0, "class", "course-sidebar svelte-1md9r1h");
			attr(div1, "class", "course-content");
			attr(section, "class", "course-section svelte-1md9r1h");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div0);
			append_hydration(div0, h3);
			append_hydration(h3, t0);
			append_hydration(div0, t1);
			append_hydration(div0, ul);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul, null);
				}
			}

			append_hydration(section, t2);
			append_hydration(section, div1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div1, null);
				}
			}
		},
		p(ctx, dirty) {
			if (dirty & /*selectedWeek, courseWeeks*/ 10) {
				each_value_3 = /*courseWeeks*/ ctx[3];
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_3(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_3.length;
			}

			if (dirty & /*courseWeeks, selectedWeek*/ 10) {
				each_value_2 = /*courseWeeks*/ ctx[3];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}
		},
		d(detaching) {
			if (detaching) detach(section);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
		}
	};
}

// (368:10) {#each courseWeeks as week}
function create_each_block_3(ctx) {
	let li;
	let button;
	let span0;
	let t0;
	let t1_value = /*week*/ ctx[23].week + "";
	let t1;
	let t2;
	let span1;
	let t3_value = /*week*/ ctx[23].title + "";
	let t3;
	let t4;
	let span2;
	let t5_value = /*week*/ ctx[23].module + "";
	let t5;
	let t6;
	let li_class_value;
	let mounted;
	let dispose;

	function click_handler_5() {
		return /*click_handler_5*/ ctx[14](/*week*/ ctx[23]);
	}

	return {
		c() {
			li = element("li");
			button = element("button");
			span0 = element("span");
			t0 = text("Week ");
			t1 = text(t1_value);
			t2 = space();
			span1 = element("span");
			t3 = text(t3_value);
			t4 = space();
			span2 = element("span");
			t5 = text(t5_value);
			t6 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			button = claim_element(li_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			span0 = claim_element(button_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "Week ");
			t1 = claim_text(span0_nodes, t1_value);
			span0_nodes.forEach(detach);
			t2 = claim_space(button_nodes);
			span1 = claim_element(button_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t3 = claim_text(span1_nodes, t3_value);
			span1_nodes.forEach(detach);
			t4 = claim_space(button_nodes);
			span2 = claim_element(button_nodes, "SPAN", { class: true });
			var span2_nodes = children(span2);
			t5 = claim_text(span2_nodes, t5_value);
			span2_nodes.forEach(detach);
			button_nodes.forEach(detach);
			t6 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "week-number svelte-1md9r1h");
			attr(span1, "class", "week-title svelte-1md9r1h");
			attr(span2, "class", "week-module svelte-1md9r1h");
			attr(button, "class", "week-btn svelte-1md9r1h");

			attr(li, "class", li_class_value = "week-item " + (/*selectedWeek*/ ctx[1] === /*week*/ ctx[23].week
			? 'active'
			: '') + " svelte-1md9r1h");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, button);
			append_hydration(button, span0);
			append_hydration(span0, t0);
			append_hydration(span0, t1);
			append_hydration(button, t2);
			append_hydration(button, span1);
			append_hydration(span1, t3);
			append_hydration(button, t4);
			append_hydration(button, span2);
			append_hydration(span2, t5);
			append_hydration(li, t6);

			if (!mounted) {
				dispose = listen(button, "click", click_handler_5);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;

			if (dirty & /*selectedWeek*/ 2 && li_class_value !== (li_class_value = "week-item " + (/*selectedWeek*/ ctx[1] === /*week*/ ctx[23].week
			? 'active'
			: '') + " svelte-1md9r1h")) {
				attr(li, "class", li_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(li);
			mounted = false;
			dispose();
		}
	};
}

// (382:10) {#if selectedWeek === week.week}
function create_if_block_3(ctx) {
	let div15;
	let header;
	let h2;
	let t0;
	let t1_value = /*week*/ ctx[23].week + "";
	let t1;
	let t2;
	let t3_value = /*week*/ ctx[23].title + "";
	let t3;
	let t4;
	let span;
	let t5_value = /*week*/ ctx[23].module + "";
	let t5;
	let t6;
	let div14;
	let div0;
	let h30;
	let t7;
	let t8;
	let ul0;
	let li0;
	let t9;
	let t10_value = /*week*/ ctx[23].week + "";
	let t10;
	let t11;
	let li1;
	let t12;
	let t13_value = /*week*/ ctx[23].week + "";
	let t13;
	let t14;
	let li2;
	let t15;
	let t16_value = /*week*/ ctx[23].week + "";
	let t16;
	let t17;
	let div6;
	let h31;
	let t18;
	let t19;
	let p0;
	let t20;
	let t21_value = /*week*/ ctx[23].week + "";
	let t21;
	let t22;
	let t23;
	let div5;
	let h40;
	let t24;
	let t25;
	let div4;
	let div1;
	let h50;
	let t26;
	let t27;
	let p1;
	let t28;
	let t29;
	let div2;
	let h51;
	let t30;
	let t31;
	let p2;
	let t32;
	let t33;
	let div3;
	let h52;
	let t34;
	let t35;
	let p3;
	let t36;
	let t37;
	let div9;
	let h32;
	let t38;
	let t39;
	let div8;
	let h41;
	let t40;
	let t41;
	let ul1;
	let li3;
	let t42;
	let t43_value = /*week*/ ctx[23].week + "";
	let t43;
	let t44;
	let li4;
	let t45;
	let t46;
	let li5;
	let t47;
	let t48;
	let h42;
	let t49;
	let t50;
	let div7;
	let p4;
	let strong;
	let t51;
	let t52;
	let t53;
	let h43;
	let t54;
	let t55;
	let ul2;
	let li6;
	let t56;
	let t57;
	let li7;
	let t58;
	let t59;
	let li8;
	let t60;
	let t61;
	let div13;
	let h33;
	let t62;
	let t63;
	let div12;
	let div10;
	let h44;
	let t64;
	let t65;
	let p5;
	let t66;
	let t67_value = /*week*/ ctx[23].week + "";
	let t67;
	let t68;
	let t69;
	let div11;
	let h45;
	let t70;
	let t71;
	let p6;
	let t72;
	let t73_value = /*week*/ ctx[23].week + "";
	let t73;
	let t74;
	let t75;

	return {
		c() {
			div15 = element("div");
			header = element("header");
			h2 = element("h2");
			t0 = text("Week ");
			t1 = text(t1_value);
			t2 = text(": ");
			t3 = text(t3_value);
			t4 = space();
			span = element("span");
			t5 = text(t5_value);
			t6 = space();
			div14 = element("div");
			div0 = element("div");
			h30 = element("h3");
			t7 = text("Learning Objectives");
			t8 = space();
			ul0 = element("ul");
			li0 = element("li");
			t9 = text("Placeholder objective 1 for Week ");
			t10 = text(t10_value);
			t11 = space();
			li1 = element("li");
			t12 = text("Placeholder objective 2 for Week ");
			t13 = text(t13_value);
			t14 = space();
			li2 = element("li");
			t15 = text("Placeholder objective 3 for Week ");
			t16 = text(t16_value);
			t17 = space();
			div6 = element("div");
			h31 = element("h3");
			t18 = text("Lesson Content");
			t19 = space();
			p0 = element("p");
			t20 = text("Detailed lesson content for Week ");
			t21 = text(t21_value);
			t22 = text(" will be displayed here. This includes step-by-step instructions, examples, and practice exercises.");
			t23 = space();
			div5 = element("div");
			h40 = element("h4");
			t24 = text("Age-Specific Adaptations");
			t25 = space();
			div4 = element("div");
			div1 = element("div");
			h50 = element("h5");
			t26 = text("Group A (10-13 years)");
			t27 = space();
			p1 = element("p");
			t28 = text("Simplified explanations with visual aids and interactive elements.");
			t29 = space();
			div2 = element("div");
			h51 = element("h5");
			t30 = text("Group B (14-17 years, Males)");
			t31 = space();
			p2 = element("p");
			t32 = text("Technical challenges and competitive exercises.");
			t33 = space();
			div3 = element("div");
			h52 = element("h5");
			t34 = text("Group C (14-17 years, Females)");
			t35 = space();
			p3 = element("p");
			t36 = text("Collaborative projects and creative applications.");
			t37 = space();
			div9 = element("div");
			h32 = element("h3");
			t38 = text("Teacher's Notes");
			t39 = space();
			div8 = element("div");
			h41 = element("h4");
			t40 = text("Preparation Tips");
			t41 = space();
			ul1 = element("ul");
			li3 = element("li");
			t42 = text("Review technical requirements for Week ");
			t43 = text(t43_value);
			t44 = space();
			li4 = element("li");
			t45 = text("Prepare backup activities for different skill levels");
			t46 = space();
			li5 = element("li");
			t47 = text("Set up demonstration materials");
			t48 = space();
			h42 = element("h4");
			t49 = text("Icebreaker Activity");
			t50 = space();
			div7 = element("div");
			p4 = element("p");
			strong = element("strong");
			t51 = text("Tech Trivia Challenge:");
			t52 = text(" Start with 3 fun questions related to this week's topic. Students can work in teams and earn points for correct answers.");
			t53 = space();
			h43 = element("h4");
			t54 = text("Common Challenges");
			t55 = space();
			ul2 = element("ul");
			li6 = element("li");
			t56 = text("Students may struggle with [specific concept]");
			t57 = space();
			li7 = element("li");
			t58 = text("Provide extra support for [particular skill]");
			t59 = space();
			li8 = element("li");
			t60 = text("Watch for confusion around [technical term]");
			t61 = space();
			div13 = element("div");
			h33 = element("h3");
			t62 = text("Practice Exercises");
			t63 = space();
			div12 = element("div");
			div10 = element("div");
			h44 = element("h4");
			t64 = text("Exercise 1: Basic Practice");
			t65 = space();
			p5 = element("p");
			t66 = text("Step-by-step guided practice for Week ");
			t67 = text(t67_value);
			t68 = text(" concepts.");
			t69 = space();
			div11 = element("div");
			h45 = element("h4");
			t70 = text("Exercise 2: Applied Learning");
			t71 = space();
			p6 = element("p");
			t72 = text("Real-world application of Week ");
			t73 = text(t73_value);
			t74 = text(" skills.");
			t75 = space();
			this.h();
		},
		l(nodes) {
			div15 = claim_element(nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			header = claim_element(div15_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			h2 = claim_element(header_nodes, "H2", {});
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Week ");
			t1 = claim_text(h2_nodes, t1_value);
			t2 = claim_text(h2_nodes, ": ");
			t3 = claim_text(h2_nodes, t3_value);
			h2_nodes.forEach(detach);
			t4 = claim_space(header_nodes);
			span = claim_element(header_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t5 = claim_text(span_nodes, t5_value);
			span_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t6 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			div0 = claim_element(div14_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h30 = claim_element(div0_nodes, "H3", {});
			var h30_nodes = children(h30);
			t7 = claim_text(h30_nodes, "Learning Objectives");
			h30_nodes.forEach(detach);
			t8 = claim_space(div0_nodes);
			ul0 = claim_element(div0_nodes, "UL", {});
			var ul0_nodes = children(ul0);
			li0 = claim_element(ul0_nodes, "LI", {});
			var li0_nodes = children(li0);
			t9 = claim_text(li0_nodes, "Placeholder objective 1 for Week ");
			t10 = claim_text(li0_nodes, t10_value);
			li0_nodes.forEach(detach);
			t11 = claim_space(ul0_nodes);
			li1 = claim_element(ul0_nodes, "LI", {});
			var li1_nodes = children(li1);
			t12 = claim_text(li1_nodes, "Placeholder objective 2 for Week ");
			t13 = claim_text(li1_nodes, t13_value);
			li1_nodes.forEach(detach);
			t14 = claim_space(ul0_nodes);
			li2 = claim_element(ul0_nodes, "LI", {});
			var li2_nodes = children(li2);
			t15 = claim_text(li2_nodes, "Placeholder objective 3 for Week ");
			t16 = claim_text(li2_nodes, t16_value);
			li2_nodes.forEach(detach);
			ul0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t17 = claim_space(div14_nodes);
			div6 = claim_element(div14_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			h31 = claim_element(div6_nodes, "H3", {});
			var h31_nodes = children(h31);
			t18 = claim_text(h31_nodes, "Lesson Content");
			h31_nodes.forEach(detach);
			t19 = claim_space(div6_nodes);
			p0 = claim_element(div6_nodes, "P", {});
			var p0_nodes = children(p0);
			t20 = claim_text(p0_nodes, "Detailed lesson content for Week ");
			t21 = claim_text(p0_nodes, t21_value);
			t22 = claim_text(p0_nodes, " will be displayed here. This includes step-by-step instructions, examples, and practice exercises.");
			p0_nodes.forEach(detach);
			t23 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h40 = claim_element(div5_nodes, "H4", {});
			var h40_nodes = children(h40);
			t24 = claim_text(h40_nodes, "Age-Specific Adaptations");
			h40_nodes.forEach(detach);
			t25 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div1 = claim_element(div4_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h50 = claim_element(div1_nodes, "H5", {});
			var h50_nodes = children(h50);
			t26 = claim_text(h50_nodes, "Group A (10-13 years)");
			h50_nodes.forEach(detach);
			t27 = claim_space(div1_nodes);
			p1 = claim_element(div1_nodes, "P", {});
			var p1_nodes = children(p1);
			t28 = claim_text(p1_nodes, "Simplified explanations with visual aids and interactive elements.");
			p1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t29 = claim_space(div4_nodes);
			div2 = claim_element(div4_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h51 = claim_element(div2_nodes, "H5", {});
			var h51_nodes = children(h51);
			t30 = claim_text(h51_nodes, "Group B (14-17 years, Males)");
			h51_nodes.forEach(detach);
			t31 = claim_space(div2_nodes);
			p2 = claim_element(div2_nodes, "P", {});
			var p2_nodes = children(p2);
			t32 = claim_text(p2_nodes, "Technical challenges and competitive exercises.");
			p2_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t33 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h52 = claim_element(div3_nodes, "H5", {});
			var h52_nodes = children(h52);
			t34 = claim_text(h52_nodes, "Group C (14-17 years, Females)");
			h52_nodes.forEach(detach);
			t35 = claim_space(div3_nodes);
			p3 = claim_element(div3_nodes, "P", {});
			var p3_nodes = children(p3);
			t36 = claim_text(p3_nodes, "Collaborative projects and creative applications.");
			p3_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t37 = claim_space(div14_nodes);
			div9 = claim_element(div14_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			h32 = claim_element(div9_nodes, "H3", {});
			var h32_nodes = children(h32);
			t38 = claim_text(h32_nodes, "Teacher's Notes");
			h32_nodes.forEach(detach);
			t39 = claim_space(div9_nodes);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			h41 = claim_element(div8_nodes, "H4", {});
			var h41_nodes = children(h41);
			t40 = claim_text(h41_nodes, "Preparation Tips");
			h41_nodes.forEach(detach);
			t41 = claim_space(div8_nodes);
			ul1 = claim_element(div8_nodes, "UL", {});
			var ul1_nodes = children(ul1);
			li3 = claim_element(ul1_nodes, "LI", {});
			var li3_nodes = children(li3);
			t42 = claim_text(li3_nodes, "Review technical requirements for Week ");
			t43 = claim_text(li3_nodes, t43_value);
			li3_nodes.forEach(detach);
			t44 = claim_space(ul1_nodes);
			li4 = claim_element(ul1_nodes, "LI", {});
			var li4_nodes = children(li4);
			t45 = claim_text(li4_nodes, "Prepare backup activities for different skill levels");
			li4_nodes.forEach(detach);
			t46 = claim_space(ul1_nodes);
			li5 = claim_element(ul1_nodes, "LI", {});
			var li5_nodes = children(li5);
			t47 = claim_text(li5_nodes, "Set up demonstration materials");
			li5_nodes.forEach(detach);
			ul1_nodes.forEach(detach);
			t48 = claim_space(div8_nodes);
			h42 = claim_element(div8_nodes, "H4", {});
			var h42_nodes = children(h42);
			t49 = claim_text(h42_nodes, "Icebreaker Activity");
			h42_nodes.forEach(detach);
			t50 = claim_space(div8_nodes);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			p4 = claim_element(div7_nodes, "P", {});
			var p4_nodes = children(p4);
			strong = claim_element(p4_nodes, "STRONG", {});
			var strong_nodes = children(strong);
			t51 = claim_text(strong_nodes, "Tech Trivia Challenge:");
			strong_nodes.forEach(detach);
			t52 = claim_text(p4_nodes, " Start with 3 fun questions related to this week's topic. Students can work in teams and earn points for correct answers.");
			p4_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t53 = claim_space(div8_nodes);
			h43 = claim_element(div8_nodes, "H4", {});
			var h43_nodes = children(h43);
			t54 = claim_text(h43_nodes, "Common Challenges");
			h43_nodes.forEach(detach);
			t55 = claim_space(div8_nodes);
			ul2 = claim_element(div8_nodes, "UL", {});
			var ul2_nodes = children(ul2);
			li6 = claim_element(ul2_nodes, "LI", {});
			var li6_nodes = children(li6);
			t56 = claim_text(li6_nodes, "Students may struggle with [specific concept]");
			li6_nodes.forEach(detach);
			t57 = claim_space(ul2_nodes);
			li7 = claim_element(ul2_nodes, "LI", {});
			var li7_nodes = children(li7);
			t58 = claim_text(li7_nodes, "Provide extra support for [particular skill]");
			li7_nodes.forEach(detach);
			t59 = claim_space(ul2_nodes);
			li8 = claim_element(ul2_nodes, "LI", {});
			var li8_nodes = children(li8);
			t60 = claim_text(li8_nodes, "Watch for confusion around [technical term]");
			li8_nodes.forEach(detach);
			ul2_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			t61 = claim_space(div14_nodes);
			div13 = claim_element(div14_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			h33 = claim_element(div13_nodes, "H3", {});
			var h33_nodes = children(h33);
			t62 = claim_text(h33_nodes, "Practice Exercises");
			h33_nodes.forEach(detach);
			t63 = claim_space(div13_nodes);
			div12 = claim_element(div13_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);
			div10 = claim_element(div12_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			h44 = claim_element(div10_nodes, "H4", {});
			var h44_nodes = children(h44);
			t64 = claim_text(h44_nodes, "Exercise 1: Basic Practice");
			h44_nodes.forEach(detach);
			t65 = claim_space(div10_nodes);
			p5 = claim_element(div10_nodes, "P", {});
			var p5_nodes = children(p5);
			t66 = claim_text(p5_nodes, "Step-by-step guided practice for Week ");
			t67 = claim_text(p5_nodes, t67_value);
			t68 = claim_text(p5_nodes, " concepts.");
			p5_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t69 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			h45 = claim_element(div11_nodes, "H4", {});
			var h45_nodes = children(h45);
			t70 = claim_text(h45_nodes, "Exercise 2: Applied Learning");
			h45_nodes.forEach(detach);
			t71 = claim_space(div11_nodes);
			p6 = claim_element(div11_nodes, "P", {});
			var p6_nodes = children(p6);
			t72 = claim_text(p6_nodes, "Real-world application of Week ");
			t73 = claim_text(p6_nodes, t73_value);
			t74 = claim_text(p6_nodes, " skills.");
			p6_nodes.forEach(detach);
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			div13_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			t75 = claim_space(div15_nodes);
			div15_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "module-badge svelte-1md9r1h");
			attr(header, "class", "lesson-header svelte-1md9r1h");
			attr(div0, "class", "learning-objectives svelte-1md9r1h");
			attr(div1, "class", "adaptation-group");
			attr(div2, "class", "adaptation-group");
			attr(div3, "class", "adaptation-group");
			attr(div4, "class", "adaptation-tabs");
			attr(div5, "class", "age-specific-content");
			attr(div6, "class", "lesson-materials svelte-1md9r1h");
			attr(div7, "class", "icebreaker-box svelte-1md9r1h");
			attr(div8, "class", "notes-content");
			attr(div9, "class", "teacher-notes svelte-1md9r1h");
			attr(div10, "class", "exercise-item");
			attr(div11, "class", "exercise-item");
			attr(div12, "class", "exercise-list");
			attr(div13, "class", "practice-exercises svelte-1md9r1h");
			attr(div14, "class", "lesson-body svelte-1md9r1h");
			attr(div15, "class", "lesson-content");
		},
		m(target, anchor) {
			insert_hydration(target, div15, anchor);
			append_hydration(div15, header);
			append_hydration(header, h2);
			append_hydration(h2, t0);
			append_hydration(h2, t1);
			append_hydration(h2, t2);
			append_hydration(h2, t3);
			append_hydration(header, t4);
			append_hydration(header, span);
			append_hydration(span, t5);
			append_hydration(div15, t6);
			append_hydration(div15, div14);
			append_hydration(div14, div0);
			append_hydration(div0, h30);
			append_hydration(h30, t7);
			append_hydration(div0, t8);
			append_hydration(div0, ul0);
			append_hydration(ul0, li0);
			append_hydration(li0, t9);
			append_hydration(li0, t10);
			append_hydration(ul0, t11);
			append_hydration(ul0, li1);
			append_hydration(li1, t12);
			append_hydration(li1, t13);
			append_hydration(ul0, t14);
			append_hydration(ul0, li2);
			append_hydration(li2, t15);
			append_hydration(li2, t16);
			append_hydration(div14, t17);
			append_hydration(div14, div6);
			append_hydration(div6, h31);
			append_hydration(h31, t18);
			append_hydration(div6, t19);
			append_hydration(div6, p0);
			append_hydration(p0, t20);
			append_hydration(p0, t21);
			append_hydration(p0, t22);
			append_hydration(div6, t23);
			append_hydration(div6, div5);
			append_hydration(div5, h40);
			append_hydration(h40, t24);
			append_hydration(div5, t25);
			append_hydration(div5, div4);
			append_hydration(div4, div1);
			append_hydration(div1, h50);
			append_hydration(h50, t26);
			append_hydration(div1, t27);
			append_hydration(div1, p1);
			append_hydration(p1, t28);
			append_hydration(div4, t29);
			append_hydration(div4, div2);
			append_hydration(div2, h51);
			append_hydration(h51, t30);
			append_hydration(div2, t31);
			append_hydration(div2, p2);
			append_hydration(p2, t32);
			append_hydration(div4, t33);
			append_hydration(div4, div3);
			append_hydration(div3, h52);
			append_hydration(h52, t34);
			append_hydration(div3, t35);
			append_hydration(div3, p3);
			append_hydration(p3, t36);
			append_hydration(div14, t37);
			append_hydration(div14, div9);
			append_hydration(div9, h32);
			append_hydration(h32, t38);
			append_hydration(div9, t39);
			append_hydration(div9, div8);
			append_hydration(div8, h41);
			append_hydration(h41, t40);
			append_hydration(div8, t41);
			append_hydration(div8, ul1);
			append_hydration(ul1, li3);
			append_hydration(li3, t42);
			append_hydration(li3, t43);
			append_hydration(ul1, t44);
			append_hydration(ul1, li4);
			append_hydration(li4, t45);
			append_hydration(ul1, t46);
			append_hydration(ul1, li5);
			append_hydration(li5, t47);
			append_hydration(div8, t48);
			append_hydration(div8, h42);
			append_hydration(h42, t49);
			append_hydration(div8, t50);
			append_hydration(div8, div7);
			append_hydration(div7, p4);
			append_hydration(p4, strong);
			append_hydration(strong, t51);
			append_hydration(p4, t52);
			append_hydration(div8, t53);
			append_hydration(div8, h43);
			append_hydration(h43, t54);
			append_hydration(div8, t55);
			append_hydration(div8, ul2);
			append_hydration(ul2, li6);
			append_hydration(li6, t56);
			append_hydration(ul2, t57);
			append_hydration(ul2, li7);
			append_hydration(li7, t58);
			append_hydration(ul2, t59);
			append_hydration(ul2, li8);
			append_hydration(li8, t60);
			append_hydration(div14, t61);
			append_hydration(div14, div13);
			append_hydration(div13, h33);
			append_hydration(h33, t62);
			append_hydration(div13, t63);
			append_hydration(div13, div12);
			append_hydration(div12, div10);
			append_hydration(div10, h44);
			append_hydration(h44, t64);
			append_hydration(div10, t65);
			append_hydration(div10, p5);
			append_hydration(p5, t66);
			append_hydration(p5, t67);
			append_hydration(p5, t68);
			append_hydration(div12, t69);
			append_hydration(div12, div11);
			append_hydration(div11, h45);
			append_hydration(h45, t70);
			append_hydration(div11, t71);
			append_hydration(div11, p6);
			append_hydration(p6, t72);
			append_hydration(p6, t73);
			append_hydration(p6, t74);
			append_hydration(div15, t75);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div15);
		}
	};
}

// (381:8) {#each courseWeeks as week}
function create_each_block_2(ctx) {
	let if_block_anchor;
	let if_block = /*selectedWeek*/ ctx[1] === /*week*/ ctx[23].week && create_if_block_3(ctx);

	return {
		c() {
			if (if_block) if_block.c();
			if_block_anchor = empty();
		},
		l(nodes) {
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
		},
		m(target, anchor) {
			if (if_block) if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
		},
		p(ctx, dirty) {
			if (/*selectedWeek*/ ctx[1] === /*week*/ ctx[23].week) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_3(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

// (467:2) {#if activeView === 'quizzes'}
function create_if_block(ctx) {
	let section;
	let div0;
	let h2;
	let t0;
	let t1;
	let p;
	let t2;
	let t3;
	let div5;
	let div2;
	let h30;
	let t4;
	let t5;
	let div1;
	let t6;
	let div4;
	let h31;
	let t7;
	let t8;
	let div3;
	let t9;
	let each_value_1 = /*quizzes*/ ctx[4];
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*tests*/ ctx[5];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	let if_block = /*selectedQuiz*/ ctx[2] && create_if_block_1(ctx);

	return {
		c() {
			section = element("section");
			div0 = element("div");
			h2 = element("h2");
			t0 = text("Assessments & Evaluations");
			t1 = space();
			p = element("p");
			t2 = text("Track progress with regular quizzes and comprehensive tests");
			t3 = space();
			div5 = element("div");
			div2 = element("div");
			h30 = element("h3");
			t4 = text("Quizzes (Every 2 Weeks)");
			t5 = space();
			div1 = element("div");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t6 = space();
			div4 = element("div");
			h31 = element("h3");
			t7 = text("Tests (Every 4 Weeks)");
			t8 = space();
			div3 = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t9 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			section = claim_element(nodes, "SECTION", { class: true });
			var section_nodes = children(section);
			div0 = claim_element(section_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h2 = claim_element(div0_nodes, "H2", {});
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Assessments & Evaluations");
			h2_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p = claim_element(div0_nodes, "P", {});
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, "Track progress with regular quizzes and comprehensive tests");
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(section_nodes);
			div5 = claim_element(section_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			div2 = claim_element(div5_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			h30 = claim_element(div2_nodes, "H3", {});
			var h30_nodes = children(h30);
			t4 = claim_text(h30_nodes, "Quizzes (Every 2 Weeks)");
			h30_nodes.forEach(detach);
			t5 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(div1_nodes);
			}

			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t6 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			h31 = claim_element(div4_nodes, "H3", {});
			var h31_nodes = children(h31);
			t7 = claim_text(h31_nodes, "Tests (Every 4 Weeks)");
			h31_nodes.forEach(detach);
			t8 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div3_nodes);
			}

			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t9 = claim_space(section_nodes);
			if (if_block) if_block.l(section_nodes);
			section_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "assessments-overview");
			attr(div1, "class", "quiz-list");
			attr(div2, "class", "assessment-category");
			attr(div3, "class", "test-list");
			attr(div4, "class", "assessment-category");
			attr(div5, "class", "assessments-grid svelte-1md9r1h");
			attr(section, "class", "quizzes-section");
		},
		m(target, anchor) {
			insert_hydration(target, section, anchor);
			append_hydration(section, div0);
			append_hydration(div0, h2);
			append_hydration(h2, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p);
			append_hydration(p, t2);
			append_hydration(section, t3);
			append_hydration(section, div5);
			append_hydration(div5, div2);
			append_hydration(div2, h30);
			append_hydration(h30, t4);
			append_hydration(div2, t5);
			append_hydration(div2, div1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(div1, null);
				}
			}

			append_hydration(div5, t6);
			append_hydration(div5, div4);
			append_hydration(div4, h31);
			append_hydration(h31, t7);
			append_hydration(div4, t8);
			append_hydration(div4, div3);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div3, null);
				}
			}

			append_hydration(section, t9);
			if (if_block) if_block.m(section, null);
		},
		p(ctx, dirty) {
			if (dirty & /*selectQuiz, quizzes*/ 144) {
				each_value_1 = /*quizzes*/ ctx[4];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(div1, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty & /*tests*/ 32) {
				each_value = /*tests*/ ctx[5];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div3, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (/*selectedQuiz*/ ctx[2]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_1(ctx);
					if_block.c();
					if_block.m(section, null);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		d(detaching) {
			if (detaching) detach(section);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			if (if_block) if_block.d();
		}
	};
}

// (478:12) {#each quizzes as quiz}
function create_each_block_1(ctx) {
	let div2;
	let div0;
	let h4;
	let t0_value = /*quiz*/ ctx[20].title + "";
	let t0;
	let t1;
	let span;
	let t2;
	let t3_value = /*quiz*/ ctx[20].week + "";
	let t3;
	let t4;
	let div1;
	let button0;
	let t5;
	let t6;
	let button1;
	let t7;
	let t8;
	let mounted;
	let dispose;

	function click_handler_6() {
		return /*click_handler_6*/ ctx[15](/*quiz*/ ctx[20]);
	}

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			h4 = element("h4");
			t0 = text(t0_value);
			t1 = space();
			span = element("span");
			t2 = text("Week ");
			t3 = text(t3_value);
			t4 = space();
			div1 = element("div");
			button0 = element("button");
			t5 = text("View Quiz");
			t6 = space();
			button1 = element("button");
			t7 = text("Print Version");
			t8 = space();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h4 = claim_element(div0_nodes, "H4", {});
			var h4_nodes = children(h4);
			t0 = claim_text(h4_nodes, t0_value);
			h4_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "Week ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t5 = claim_text(button0_nodes, "View Quiz");
			button0_nodes.forEach(detach);
			t6 = claim_space(div1_nodes);
			button1 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t7 = claim_text(button1_nodes, "Print Version");
			button1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t8 = claim_space(div2_nodes);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "quiz-week");
			attr(div0, "class", "quiz-header");
			attr(button0, "class", "quiz-btn svelte-1md9r1h");
			attr(button1, "class", "quiz-btn secondary svelte-1md9r1h");
			attr(div1, "class", "quiz-actions");
			attr(div2, "class", "quiz-card svelte-1md9r1h");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, h4);
			append_hydration(h4, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(div2, t4);
			append_hydration(div2, div1);
			append_hydration(div1, button0);
			append_hydration(button0, t5);
			append_hydration(div1, t6);
			append_hydration(div1, button1);
			append_hydration(button1, t7);
			append_hydration(div2, t8);

			if (!mounted) {
				dispose = listen(button0, "click", click_handler_6);
				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
		},
		d(detaching) {
			if (detaching) detach(div2);
			mounted = false;
			dispose();
		}
	};
}

// (500:12) {#each tests as test}
function create_each_block(ctx) {
	let div3;
	let div0;
	let h4;
	let t0_value = /*test*/ ctx[17].title + "";
	let t0;
	let t1;
	let span;
	let t2;
	let t3_value = /*test*/ ctx[17].week + "";
	let t3;
	let t4;
	let div1;
	let p;
	let t5;
	let t6_value = /*test*/ ctx[17].modules.join(', ') + "";
	let t6;
	let t7;
	let div2;
	let button0;
	let t8;
	let t9;
	let button1;
	let t10;
	let t11;

	return {
		c() {
			div3 = element("div");
			div0 = element("div");
			h4 = element("h4");
			t0 = text(t0_value);
			t1 = space();
			span = element("span");
			t2 = text("Week ");
			t3 = text(t3_value);
			t4 = space();
			div1 = element("div");
			p = element("p");
			t5 = text("Covers: ");
			t6 = text(t6_value);
			t7 = space();
			div2 = element("div");
			button0 = element("button");
			t8 = text("View Test");
			t9 = space();
			button1 = element("button");
			t10 = text("Print A4");
			t11 = space();
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			div0 = claim_element(div3_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h4 = claim_element(div0_nodes, "H4", {});
			var h4_nodes = children(h4);
			t0 = claim_text(h4_nodes, t0_value);
			h4_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, "Week ");
			t3 = claim_text(span_nodes, t3_value);
			span_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div3_nodes);
			div1 = claim_element(div3_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			p = claim_element(div1_nodes, "P", {});
			var p_nodes = children(p);
			t5 = claim_text(p_nodes, "Covers: ");
			t6 = claim_text(p_nodes, t6_value);
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t7 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			button0 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t8 = claim_text(button0_nodes, "View Test");
			button0_nodes.forEach(detach);
			t9 = claim_space(div2_nodes);
			button1 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t10 = claim_text(button1_nodes, "Print A4");
			button1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "test-week");
			attr(div0, "class", "test-header");
			attr(div1, "class", "test-modules");
			attr(button0, "class", "test-btn svelte-1md9r1h");
			attr(button1, "class", "test-btn secondary svelte-1md9r1h");
			attr(div2, "class", "test-actions");
			attr(div3, "class", "test-card svelte-1md9r1h");
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, div0);
			append_hydration(div0, h4);
			append_hydration(h4, t0);
			append_hydration(div0, t1);
			append_hydration(div0, span);
			append_hydration(span, t2);
			append_hydration(span, t3);
			append_hydration(div3, t4);
			append_hydration(div3, div1);
			append_hydration(div1, p);
			append_hydration(p, t5);
			append_hydration(p, t6);
			append_hydration(div3, t7);
			append_hydration(div3, div2);
			append_hydration(div2, button0);
			append_hydration(button0, t8);
			append_hydration(div2, t9);
			append_hydration(div2, button1);
			append_hydration(button1, t10);
			append_hydration(div3, t11);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div3);
		}
	};
}

// (519:6) {#if selectedQuiz}
function create_if_block_1(ctx) {
	let div3;
	let h3;
	let t0;
	let t1;
	let t2;
	let t3;
	let div2;
	let p;
	let t4;
	let t5;
	let t6;
	let t7;
	let div0;
	let h40;
	let t8;
	let t9;
	let ol;
	let li0;
	let t10;
	let t11;
	let li1;
	let t12;
	let t13;
	let li2;
	let t14;
	let t15;
	let div1;
	let h41;
	let t16;
	let t17;
	let ul;
	let li3;
	let t18;
	let t19;
	let li4;
	let t20;
	let t21;
	let li5;
	let t22;

	return {
		c() {
			div3 = element("div");
			h3 = element("h3");
			t0 = text("Quiz ");
			t1 = text(/*selectedQuiz*/ ctx[2]);
			t2 = text(" Details");
			t3 = space();
			div2 = element("div");
			p = element("p");
			t4 = text("Detailed quiz content for Quiz ");
			t5 = text(/*selectedQuiz*/ ctx[2]);
			t6 = text(" will be displayed here.");
			t7 = space();
			div0 = element("div");
			h40 = element("h4");
			t8 = text("Sample Questions:");
			t9 = space();
			ol = element("ol");
			li0 = element("li");
			t10 = text("Multiple choice question about the week's topic");
			t11 = space();
			li1 = element("li");
			t12 = text("True/False question testing key concepts");
			t13 = space();
			li2 = element("li");
			t14 = text("Short answer question for practical application");
			t15 = space();
			div1 = element("div");
			h41 = element("h4");
			t16 = text("Instructions for Teachers:");
			t17 = space();
			ul = element("ul");
			li3 = element("li");
			t18 = text("Allow 15-20 minutes for completion");
			t19 = space();
			li4 = element("li");
			t20 = text("Provide scratch paper if needed");
			t21 = space();
			li5 = element("li");
			t22 = text("Review answers as a class afterward");
			this.h();
		},
		l(nodes) {
			div3 = claim_element(nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h3 = claim_element(div3_nodes, "H3", {});
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Quiz ");
			t1 = claim_text(h3_nodes, /*selectedQuiz*/ ctx[2]);
			t2 = claim_text(h3_nodes, " Details");
			h3_nodes.forEach(detach);
			t3 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			p = claim_element(div2_nodes, "P", {});
			var p_nodes = children(p);
			t4 = claim_text(p_nodes, "Detailed quiz content for Quiz ");
			t5 = claim_text(p_nodes, /*selectedQuiz*/ ctx[2]);
			t6 = claim_text(p_nodes, " will be displayed here.");
			p_nodes.forEach(detach);
			t7 = claim_space(div2_nodes);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h40 = claim_element(div0_nodes, "H4", {});
			var h40_nodes = children(h40);
			t8 = claim_text(h40_nodes, "Sample Questions:");
			h40_nodes.forEach(detach);
			t9 = claim_space(div0_nodes);
			ol = claim_element(div0_nodes, "OL", {});
			var ol_nodes = children(ol);
			li0 = claim_element(ol_nodes, "LI", {});
			var li0_nodes = children(li0);
			t10 = claim_text(li0_nodes, "Multiple choice question about the week's topic");
			li0_nodes.forEach(detach);
			t11 = claim_space(ol_nodes);
			li1 = claim_element(ol_nodes, "LI", {});
			var li1_nodes = children(li1);
			t12 = claim_text(li1_nodes, "True/False question testing key concepts");
			li1_nodes.forEach(detach);
			t13 = claim_space(ol_nodes);
			li2 = claim_element(ol_nodes, "LI", {});
			var li2_nodes = children(li2);
			t14 = claim_text(li2_nodes, "Short answer question for practical application");
			li2_nodes.forEach(detach);
			ol_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t15 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h41 = claim_element(div1_nodes, "H4", {});
			var h41_nodes = children(h41);
			t16 = claim_text(h41_nodes, "Instructions for Teachers:");
			h41_nodes.forEach(detach);
			t17 = claim_space(div1_nodes);
			ul = claim_element(div1_nodes, "UL", {});
			var ul_nodes = children(ul);
			li3 = claim_element(ul_nodes, "LI", {});
			var li3_nodes = children(li3);
			t18 = claim_text(li3_nodes, "Allow 15-20 minutes for completion");
			li3_nodes.forEach(detach);
			t19 = claim_space(ul_nodes);
			li4 = claim_element(ul_nodes, "LI", {});
			var li4_nodes = children(li4);
			t20 = claim_text(li4_nodes, "Provide scratch paper if needed");
			li4_nodes.forEach(detach);
			t21 = claim_space(ul_nodes);
			li5 = claim_element(ul_nodes, "LI", {});
			var li5_nodes = children(li5);
			t22 = claim_text(li5_nodes, "Review answers as a class afterward");
			li5_nodes.forEach(detach);
			ul_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "quiz-questions");
			attr(div1, "class", "quiz-instructions");
			attr(div2, "class", "quiz-content");
			attr(div3, "class", "quiz-detail");
		},
		m(target, anchor) {
			insert_hydration(target, div3, anchor);
			append_hydration(div3, h3);
			append_hydration(h3, t0);
			append_hydration(h3, t1);
			append_hydration(h3, t2);
			append_hydration(div3, t3);
			append_hydration(div3, div2);
			append_hydration(div2, p);
			append_hydration(p, t4);
			append_hydration(p, t5);
			append_hydration(p, t6);
			append_hydration(div2, t7);
			append_hydration(div2, div0);
			append_hydration(div0, h40);
			append_hydration(h40, t8);
			append_hydration(div0, t9);
			append_hydration(div0, ol);
			append_hydration(ol, li0);
			append_hydration(li0, t10);
			append_hydration(ol, t11);
			append_hydration(ol, li1);
			append_hydration(li1, t12);
			append_hydration(ol, t13);
			append_hydration(ol, li2);
			append_hydration(li2, t14);
			append_hydration(div2, t15);
			append_hydration(div2, div1);
			append_hydration(div1, h41);
			append_hydration(h41, t16);
			append_hydration(div1, t17);
			append_hydration(div1, ul);
			append_hydration(ul, li3);
			append_hydration(li3, t18);
			append_hydration(ul, t19);
			append_hydration(ul, li4);
			append_hydration(li4, t20);
			append_hydration(ul, t21);
			append_hydration(ul, li5);
			append_hydration(li5, t22);
		},
		p(ctx, dirty) {
			if (dirty & /*selectedQuiz*/ 4) set_data(t1, /*selectedQuiz*/ ctx[2]);
			if (dirty & /*selectedQuiz*/ 4) set_data(t5, /*selectedQuiz*/ ctx[2]);
		},
		d(detaching) {
			if (detaching) detach(div3);
		}
	};
}

function create_fragment(ctx) {
	let header;
	let div;
	let h1;
	let t0;
	let t1;
	let nav;
	let button0;
	let t2;
	let button0_class_value;
	let t3;
	let button1;
	let t4;
	let button1_class_value;
	let t5;
	let button2;
	let t6;
	let button2_class_value;
	let t7;
	let main;
	let t8;
	let t9;
	let mounted;
	let dispose;
	let if_block0 = /*activeView*/ ctx[0] === 'home' && create_if_block_4(ctx);
	let if_block1 = /*activeView*/ ctx[0] === 'course' && create_if_block_2(ctx);
	let if_block2 = /*activeView*/ ctx[0] === 'quizzes' && create_if_block(ctx);

	return {
		c() {
			header = element("header");
			div = element("div");
			h1 = element("h1");
			t0 = text("ICDL Learning Hub");
			t1 = space();
			nav = element("nav");
			button0 = element("button");
			t2 = text("Home");
			t3 = space();
			button1 = element("button");
			t4 = text("Course Content");
			t5 = space();
			button2 = element("button");
			t6 = text("Assessments");
			t7 = space();
			main = element("main");
			if (if_block0) if_block0.c();
			t8 = space();
			if (if_block1) if_block1.c();
			t9 = space();
			if (if_block2) if_block2.c();
			this.h();
		},
		l(nodes) {
			header = claim_element(nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div = claim_element(header_nodes, "DIV", { class: true });
			var div_nodes = children(div);
			h1 = claim_element(div_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t0 = claim_text(h1_nodes, "ICDL Learning Hub");
			h1_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			nav = claim_element(div_nodes, "NAV", { class: true });
			var nav_nodes = children(nav);
			button0 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t2 = claim_text(button0_nodes, "Home");
			button0_nodes.forEach(detach);
			t3 = claim_space(nav_nodes);
			button1 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t4 = claim_text(button1_nodes, "Course Content");
			button1_nodes.forEach(detach);
			t5 = claim_space(nav_nodes);
			button2 = claim_element(nav_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t6 = claim_text(button2_nodes, "Assessments");
			button2_nodes.forEach(detach);
			nav_nodes.forEach(detach);
			div_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t7 = claim_space(nodes);
			main = claim_element(nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			if (if_block0) if_block0.l(main_nodes);
			t8 = claim_space(main_nodes);
			if (if_block1) if_block1.l(main_nodes);
			t9 = claim_space(main_nodes);
			if (if_block2) if_block2.l(main_nodes);
			main_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h1, "class", "site-title svelte-1md9r1h");
			attr(button0, "class", button0_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'home' ? 'active' : '') + " svelte-1md9r1h");
			attr(button1, "class", button1_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'course' ? 'active' : '') + " svelte-1md9r1h");
			attr(button2, "class", button2_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'quizzes' ? 'active' : '') + " svelte-1md9r1h");
			attr(nav, "class", "main-nav svelte-1md9r1h");
			attr(div, "class", "header-content svelte-1md9r1h");
			attr(header, "class", "main-header svelte-1md9r1h");
			attr(main, "class", "main-content svelte-1md9r1h");
		},
		m(target, anchor) {
			insert_hydration(target, header, anchor);
			append_hydration(header, div);
			append_hydration(div, h1);
			append_hydration(h1, t0);
			append_hydration(div, t1);
			append_hydration(div, nav);
			append_hydration(nav, button0);
			append_hydration(button0, t2);
			append_hydration(nav, t3);
			append_hydration(nav, button1);
			append_hydration(button1, t4);
			append_hydration(nav, t5);
			append_hydration(nav, button2);
			append_hydration(button2, t6);
			insert_hydration(target, t7, anchor);
			insert_hydration(target, main, anchor);
			if (if_block0) if_block0.m(main, null);
			append_hydration(main, t8);
			if (if_block1) if_block1.m(main, null);
			append_hydration(main, t9);
			if (if_block2) if_block2.m(main, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[9]),
					listen(button1, "click", /*click_handler_1*/ ctx[10]),
					listen(button2, "click", /*click_handler_2*/ ctx[11])
				];

				mounted = true;
			}
		},
		p(ctx, [dirty]) {
			if (dirty & /*activeView*/ 1 && button0_class_value !== (button0_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'home' ? 'active' : '') + " svelte-1md9r1h")) {
				attr(button0, "class", button0_class_value);
			}

			if (dirty & /*activeView*/ 1 && button1_class_value !== (button1_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'course' ? 'active' : '') + " svelte-1md9r1h")) {
				attr(button1, "class", button1_class_value);
			}

			if (dirty & /*activeView*/ 1 && button2_class_value !== (button2_class_value = "nav-btn " + (/*activeView*/ ctx[0] === 'quizzes' ? 'active' : '') + " svelte-1md9r1h")) {
				attr(button2, "class", button2_class_value);
			}

			if (/*activeView*/ ctx[0] === 'home') {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_4(ctx);
					if_block0.c();
					if_block0.m(main, t8);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*activeView*/ ctx[0] === 'course') {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_2(ctx);
					if_block1.c();
					if_block1.m(main, t9);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*activeView*/ ctx[0] === 'quizzes') {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block(ctx);
					if_block2.c();
					if_block2.m(main, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(header);
			if (detaching) detach(t7);
			if (detaching) detach(main);
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
	let activeView = 'home'; // 'home', 'course', 'quizzes'
	let selectedWeek = 1;
	let selectedQuiz = 1;

	// Course data structure
	const courseWeeks = [
		{
			week: 1,
			title: "Introduction to Computers & OS",
			module: "Computer Essentials"
		},
		{
			week: 2,
			title: "Files, Folders & System Management",
			module: "Computer Essentials"
		},
		{
			week: 3,
			title: "Internet Basics & Web Browsing",
			module: "Online Essentials"
		},
		{
			week: 4,
			title: "Email & Online Communication",
			module: "Online Essentials"
		},
		{
			week: 5,
			title: "Word Processing Fundamentals",
			module: "Word Processing"
		},
		{
			week: 6,
			title: "Document Formatting & Styles",
			module: "Word Processing"
		},
		{
			week: 7,
			title: "Advanced Word Features",
			module: "Word Processing"
		},
		{
			week: 8,
			title: "Tables, Images & Document Review",
			module: "Word Processing"
		},
		{
			week: 9,
			title: "Spreadsheet Basics & Data Entry",
			module: "Spreadsheets"
		},
		{
			week: 10,
			title: "Formulas, Functions & Calculations",
			module: "Spreadsheets"
		},
		{
			week: 11,
			title: "Charts, Graphs & Data Analysis",
			module: "Spreadsheets"
		},
		{
			week: 12,
			title: "Final Project & Course Review",
			module: "All Modules"
		}
	];

	const quizzes = [
		{
			id: 1,
			week: 2,
			title: "Computer Essentials Quiz 1"
		},
		{
			id: 2,
			week: 4,
			title: "Online Essentials Quiz 2"
		},
		{
			id: 3,
			week: 6,
			title: "Word Processing Quiz 3"
		},
		{
			id: 4,
			week: 8,
			title: "Word Processing Quiz 4"
		},
		{
			id: 5,
			week: 10,
			title: "Spreadsheets Quiz 5"
		},
		{
			id: 6,
			week: 12,
			title: "Final Review Quiz 6"
		}
	];

	const tests = [
		{
			id: 1,
			week: 4,
			title: "Mid-Course Test 1",
			modules: ["Computer Essentials", "Online Essentials"]
		},
		{
			id: 2,
			week: 8,
			title: "Mid-Course Test 2",
			modules: ["Word Processing"]
		},
		{
			id: 3,
			week: 12,
			title: "Final Test",
			modules: ["All Modules"]
		}
	];

	function setActiveView(view) {
		$$invalidate(0, activeView = view);
	}

	function selectQuiz(quizId) {
		$$invalidate(2, selectedQuiz = quizId);
		$$invalidate(0, activeView = 'quizzes');
	}

	const click_handler = () => setActiveView('home');
	const click_handler_1 = () => setActiveView('course');
	const click_handler_2 = () => setActiveView('quizzes');
	const click_handler_3 = () => setActiveView('course');
	const click_handler_4 = () => setActiveView('quizzes');
	const click_handler_5 = week => $$invalidate(1, selectedWeek = week.week);
	const click_handler_6 = quiz => selectQuiz(quiz.id);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(8, props = $$props.props);
	};

	return [
		activeView,
		selectedWeek,
		selectedQuiz,
		courseWeeks,
		quizzes,
		tests,
		setActiveView,
		selectQuiz,
		props,
		click_handler,
		click_handler_1,
		click_handler_2,
		click_handler_3,
		click_handler_4,
		click_handler_5,
		click_handler_6
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 8 });
	}
}

export { Component as default };
