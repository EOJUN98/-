-- Atomic default-policy setter to avoid race conditions under concurrent requests.
-- If the policy does not belong to the current user, nothing is updated.

CREATE OR REPLACE FUNCTION public.set_default_product_policy(p_policy_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
AS $$
    WITH target AS (
        SELECT 1 AS ok
        FROM public.product_policies
        WHERE id = p_policy_id
          AND user_id = auth.uid()
        LIMIT 1
    ),
    upd AS (
        UPDATE public.product_policies
        SET is_default = (id = p_policy_id)
        WHERE user_id = auth.uid()
          AND EXISTS (SELECT 1 FROM target)
        RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM upd);
$$;

GRANT EXECUTE ON FUNCTION public.set_default_product_policy(UUID) TO authenticated;

