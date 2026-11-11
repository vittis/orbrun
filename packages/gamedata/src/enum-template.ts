/**
 * Non-executable compatibility templates from DCSS enums.js, recorded at
 * gamedata acd3d60e20f899c1c8a546953d6ffa0f6c7fe0c8. See ATTRIBUTION.md.
 * The parser compares ASTs, never calls these functions. A server changing
 * their algorithms requires an explicit parser compatibility review.
 */
export const ENUM_FUNCTION_TEMPLATE = String.raw`
function array_and(arr1, arr2)
    {
        var result = [];
        for (var i = 0; i < arr1.length && i < arr2.length; ++i)
        {
            result.push(arr1[i] & arr2[i]);
        }
        return result;
    }
function array_equal(arr1, arr2)
    {
        // return (arr1 <= arr2) && (arr1 >= arr2);
        for (var i = 0; i < arr1.length || i < arr2.length; ++i)
        {
            if ((arr1[i] || 0) != (arr2[i] || 0))
                return false;
        }
        return true;
    }
function array_nonzero(arr)
    {
        for (var i = 0; i < arr.length; ++i)
        {
            if (arr[i] != 0) return true;
        }
        return false;
    }
function prepare_flags(tileidx, flagdata, cache)
    {
        if (!isNaN(tileidx))
            tileidx = [tileidx];
        else if (tileidx.value !== undefined)
            return tileidx;
        while (tileidx.length < 2) tileidx.push(0);

        if (cache[[tileidx[0],tileidx[1]]] !== undefined)
            return cache[[tileidx[0],tileidx[1]]];

        for (var flagname in flagdata.flags)
        {
            var flagmask = flagdata.flags[flagname];
            if (isNaN(flagmask))
                tileidx[flagname] = array_nonzero(array_and(tileidx, flagmask));
            else
                tileidx[flagname] = (tileidx[0] & flagmask) != 0;
        }

        for (var i = 0; i < flagdata.exclusive_flags.length; ++i)
        {
            var excl = flagdata.exclusive_flags[i];
            var val;
            if (isNaN(excl.mask))
                val = array_and(tileidx, excl.mask);
            else
                val = [tileidx[0] & excl.mask];

            for (var flagname in excl)
            {
                if (flagname === "mask") continue;
                if (isNaN(excl[flagname]))
                    tileidx[flagname] = array_equal(val, excl[flagname]);
                else
                    tileidx[flagname] = (val[0] == excl[flagname]);
            }
        }

        tileidx.value = tileidx[0] & flagdata.mask;
        cache[[tileidx[0],tileidx[1]]] = tileidx;
        cache.size++;
        return tileidx;
    }
exports.prepare_fg_flags = function (tileidx)
    {
        if (fg_cache.size >= 100)
            fg_cache = { size : 0 };
        return prepare_flags(tileidx, fg_flags, fg_cache);
    }
exports.prepare_bg_flags = function (tileidx)
    {
        if (bg_cache.size >= 250)
            bg_cache = { size : 0 };
        return prepare_flags(tileidx, bg_flags, bg_cache);
    }
exports.reverse_lookup = function (e, value) {
        for (var prop in e)
        {
            if (e[prop] == value)
                return prop;
        }
    };
`
