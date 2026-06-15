import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// 預設店家 ID（單店模式）
const SHOP_ID = "00000000-0000-0000-0000-000000000001";

// ═══ 店家設定 ═══
export async function loadShopConfig() {
  const { data } = await supabase.from("shops").select("*").eq("id", SHOP_ID).single();
  if (!data) return null;
  return {
    shopName: data.name,
    mgrPassword: data.mgr_password,
    deadlineDay: data.deadline_day,
    ptBudget: data.pt_budget,
    shifts: data.shifts || [],
    needs: data.needs || {},
  };
}

export async function saveShopConfig(config) {
  await supabase.from("shops").update({
    name: config.shopName,
    mgr_password: config.mgrPassword,
    deadline_day: config.deadlineDay,
    pt_budget: config.ptBudget,
    shifts: config.shifts,
    needs: config.needs,
  }).eq("id", SHOP_ID);
}

// ═══ 員工 ═══
export async function loadStaff() {
  const { data } = await supabase.from("staff").select("*").eq("shop_id", SHOP_ID).order("created_at");
  if (!data) return [];
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    rate: s.rate,
    alTotal: s.annual_total,
    alUsed: s.annual_used,
    pw: s.password,
    canView: s.can_view,
    canEdit: s.can_edit,
    active: s.active,
  }));
}

export async function addStaffMember(staffData) {
  const { data } = await supabase.from("staff").insert({
    shop_id: SHOP_ID,
    name: staffData.name,
    type: staffData.type,
    rate: staffData.rate,
    annual_total: staffData.alTotal,
    annual_used: staffData.alUsed || 0,
    password: staffData.pw || "1234",
    can_view: staffData.canView ?? true,
    can_edit: staffData.canEdit ?? false,
    active: true,
  }).select().single();
  return data;
}

export async function updateStaffMember(id, updates) {
  const mapped = {};
  if (updates.name !== undefined) mapped.name = updates.name;
  if (updates.type !== undefined) mapped.type = updates.type;
  if (updates.rate !== undefined) mapped.rate = updates.rate;
  if (updates.alTotal !== undefined) mapped.annual_total = updates.alTotal;
  if (updates.alUsed !== undefined) mapped.annual_used = updates.alUsed;
  if (updates.pw !== undefined) mapped.password = updates.pw;
  if (updates.canView !== undefined) mapped.can_view = updates.canView;
  if (updates.canEdit !== undefined) mapped.can_edit = updates.canEdit;
  if (updates.active !== undefined) mapped.active = updates.active;
  await supabase.from("staff").update(mapped).eq("id", id);
}

// ═══ 公休日 ═══
export async function loadHolidays(year, month) {
  const { data } = await supabase.from("holidays").select("day").eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  return (data || []).map((h) => h.day);
}

export async function saveHolidays(year, month, days) {
  // 先刪除舊資料
  await supabase.from("holidays").delete().eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  // 再插入新資料
  if (days.length > 0) {
    await supabase.from("holidays").insert(
      days.map((d) => ({ shop_id: SHOP_ID, year, month, day: d }))
    );
  }
}

// ═══ 活動 ═══
export async function loadEvents(year, month) {
  const { data } = await supabase.from("events").select("*").eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  const result = {};
  (data || []).forEach((e) => { result[String(e.day)] = { name: e.name, extra: e.extra_staff }; });
  return result;
}

export async function saveEvent(year, month, day, name, extra) {
  await supabase.from("events").upsert({
    shop_id: SHOP_ID, year, month, day: parseInt(day), name, extra_staff: extra,
  }, { onConflict: "shop_id,year,month,day" });
}

export async function deleteEvent(year, month, day) {
  await supabase.from("events").delete()
    .eq("shop_id", SHOP_ID).eq("year", year).eq("month", month).eq("day", parseInt(day));
}

// ═══ 休假日填報 ═══
export async function loadRestDays(year, month) {
  const { data } = await supabase.from("rest_days").select("staff_id, day").eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  const result = {};
  (data || []).forEach((r) => { result[r.staff_id + "-" + r.day] = true; });
  return result;
}

export async function toggleRestDay(staffId, year, month, day) {
  // 檢查是否已存在
  const { data } = await supabase.from("rest_days").select("id")
    .eq("shop_id", SHOP_ID).eq("staff_id", staffId).eq("year", year).eq("month", month).eq("day", day);

  if (data && data.length > 0) {
    await supabase.from("rest_days").delete().eq("id", data[0].id);
    return false; // removed
  } else {
    await supabase.from("rest_days").insert({ shop_id: SHOP_ID, staff_id: staffId, year, month, day });
    return true; // added
  }
}

// ═══ 排班結果 ═══
export async function loadSchedule(year, month) {
  const { data } = await supabase.from("schedule_entries").select("staff_id, shift_id, day")
    .eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  const result = {};
  (data || []).forEach((e) => {
    if (!result[e.day]) result[e.day] = [];
    result[e.day].push({ id: e.staff_id, shift: e.shift_id });
  });
  return result;
}

export async function saveSchedule(year, month, schedule) {
  // 刪除舊排班
  await supabase.from("schedule_entries").delete().eq("shop_id", SHOP_ID).eq("year", year).eq("month", month);
  // 插入新排班
  const entries = [];
  Object.entries(schedule).forEach(([day, assignments]) => {
    assignments.forEach((a) => {
      entries.push({ shop_id: SHOP_ID, staff_id: a.id, shift_id: a.shift, year, month, day: parseInt(day) });
    });
  });
  if (entries.length > 0) {
    await supabase.from("schedule_entries").insert(entries);
  }
}

// ═══ 休假申請 ═══
export async function loadLeaveRequests() {
  const { data } = await supabase.from("leave_requests").select("*").eq("shop_id", SHOP_ID).order("created_at", { ascending: false });
  return (data || []).map((r) => ({
    id: r.id,
    staffId: r.staff_id,
    date: r.date,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function addLeaveRequest(staffId, date, reason) {
  const { data } = await supabase.from("leave_requests").insert({
    shop_id: SHOP_ID, staff_id: staffId, date, reason, status: "pending",
  }).select().single();
  return data;
}

export async function updateLeaveStatus(id, status) {
  await supabase.from("leave_requests").update({ status }).eq("id", id);
}

// ═══ 發布紀錄 ═══
export async function loadPublishInfo(year, month) {
  const { data } = await supabase.from("publish_logs").select("*")
    .eq("shop_id", SHOP_ID).eq("year", year).eq("month", month)
    .order("published_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

export async function savePublishLog(year, month) {
  await supabase.from("publish_logs").insert({ shop_id: SHOP_ID, year, month });
}
