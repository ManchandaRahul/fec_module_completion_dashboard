import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

// ─── Constants ───────────────────────────────────────────────────────────────
const MASTER_BAR_COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b",
  "#10b981", "#ef4444", "#ec4899", "#06b6d4",
];
const STATUS_COLORS = {
  DONE: "#22c55e",
  PENDING: "#f59e0b",
  "AWAITING REQUIREMENT FROM CLIENT": "#ef4444",
};

const STATUS_LABELS = {
  DONE: "Done",
  PENDING: "Pending",
  "AWAITING REQUIREMENT FROM CLIENT": "Awaiting Requirement",
};

const MODULE_COLORS = [
  "#3b82f6", "#8b5cf6", "#f59e0b",
  "#10b981", "#ef4444", "#ec4899", "#06b6d4",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function computeStats(rows) {
  const byStatus = {};
  rows.forEach((r) => {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  });
  const done = byStatus["DONE"] || 0;
  const pending = byStatus["PENDING"] || 0;
  const awaiting = byStatus["AWAITING REQUIREMENT FROM CLIENT"] || 0;
  const subModules = [...new Set(rows.map((r) => r.subModule).filter(Boolean))];
  return { total: rows.length, done, pending, awaiting, subModules: subModules.length, byStatus };
}

function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary" });
        const sheet = wb.Sheets["Consolidated Master"];
        if (!sheet) {
          reject(new Error("Sheet 'Consolidated Master' not found in the uploaded file."));
          return;
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const parsed = rows
          .map((r) => ({
            module: (r["Module (Level 1)"] || "").trim(),
            subModule: (r["Sub-Module (Level 2)"] || "").trim(),
            task: (r["Task"] || r["Task "] || "").trim(),
            description: (r["Description / Notes"] || r["Description"] || "").trim(),
            status: (r["Status"] || r["Status "] || "").trim().toUpperCase(),
          }))
          .filter((r) => r.module && r.task);
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsBinaryString(file);
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({ label, value, color, bg }) {
  return (
    <div style={{
      background: bg || "#f0f9ff",
      borderRadius: "12px",
      padding: "1.2rem 1.5rem",
      textAlign: "center",
      border: `2px solid ${color}22`,
      flex: 1,
      minWidth: "130px",
    }}>
      <div style={{ fontSize: "2rem", fontWeight: "700", color }}>{value}</div>
      <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: "4px", fontWeight: "500" }}>{label}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#94a3b8";
  const label = STATUS_LABELS[status] || status;
  return (
    <span style={{
      background: color + "18",
      color,
      border: `1px solid ${color}55`,
      borderRadius: "6px",
      padding: "2px 10px",
      fontSize: "0.78rem",
      fontWeight: "600",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [rawData, setRawData] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedModule, setSelectedModule] = useState("");
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showTopButton, setShowTopButton] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Strict admin detection - only when ?admin=true is in the URL
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  setIsAdmin(params.get("admin") === "true");
}, []);

  // Load saved data from sessionStorage on mount
useEffect(() => {
  const loadData = async () => {
    try {
      const res = await fetch("/latest-report.json");
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          setRawData(json);
          return;
        }
      }
    } catch (_) {}
    // Fallback to sessionStorage
    const saved = sessionStorage.getItem("fec-dashboard-data");
    if (saved) {
      try { setRawData(JSON.parse(saved)); } catch (_) {}
    }
  };
  loadData();
}, []);

  // Scroll-to-top button
  useEffect(() => {
    const handleScroll = () => setShowTopButton(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Upload handler
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError("");
    setUploadSuccess("");
    setIsProcessing(true);
    try {
      const parsed = await parseExcel(file);
      setRawData(parsed);
      sessionStorage.setItem("fec-dashboard-data", JSON.stringify(parsed));
      setSelectedModule("");
      setSearchText("");
      setStatusFilter("");
      setUploadSuccess(`Successfully loaded ${parsed.length} tasks from "${file.name}".`);
    } catch (err) {
      setUploadError(err.message || "An error occurred while processing the file.");
    } finally {
      setIsProcessing(false);
      e.target.value = "";
    }
  };
const downloadSessionData = () => {
  if (!rawData || rawData.length === 0) {
    alert("No data found. Please upload a file first.");
    return;
  }
  const jsonString = JSON.stringify(rawData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "latest-report.json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

  // ── Derived data
  const MODULES = [...new Set(rawData.map((r) => r.module))].filter(Boolean);

  const moduleRows = selectedModule
    ? rawData.filter((r) => r.module === selectedModule)
    : [];

  const filteredRows = moduleRows.filter((r) => {
    const matchSearch =
      !searchText ||
      r.task.toLowerCase().includes(searchText.toLowerCase()) ||
      r.subModule.toLowerCase().includes(searchText.toLowerCase()) ||
      r.description.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const stats = computeStats(filteredRows);

  const moduleAllRows = selectedModule
    ? rawData.filter((r) => r.module === selectedModule)
    : [];
  const allStats = computeStats(moduleAllRows);

  const statusChartData = Object.entries(allStats.byStatus).map(([name, value]) => ({
    name: STATUS_LABELS[name] || name,
    value,
    color: STATUS_COLORS[name] || "#94a3b8",
  }));

  const subModuleData = (() => {
    const map = {};
    moduleAllRows.forEach((r) => {
      if (!r.subModule) return;
      if (!map[r.subModule])
        map[r.subModule] = { DONE: 0, PENDING: 0, "AWAITING REQUIREMENT FROM CLIENT": 0 };
      map[r.subModule][r.status] = (map[r.subModule][r.status] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => (b.DONE || 0) - (a.DONE || 0));
  })();

  const overallModuleData = MODULES.map((m, i) => {
    const rows = rawData.filter((r) => r.module === m);
    const s = computeStats(rows);
    return {
      name: m,
      total: s.total,
      done: s.done,
      pending: s.pending + s.awaiting,
      color: MODULE_COLORS[i % MODULE_COLORS.length],
    };
  });

  // Decide if we need compact bar chart (for modules with many sub-modules)
  const needsCompactChart = ["Import", "Warehousing", "BTBT", "Export"].some(
    (mod) => selectedModule === mod
  );

  // Special handling for Master module (vertical chart + different Done color)
  const isMasterModule = selectedModule && selectedModule.toLowerCase().includes("master");
  const useVerticalChart = isMasterModule || subModuleData.length > 15;

  // Dynamic settings
const chartHeight = useVerticalChart ? 520 : (needsCompactChart ? 340 : 320);  const barThickness = useVerticalChart ? 22 : (needsCompactChart || subModuleData.length > 12 ? 16 : 24);
  const yTickSize = subModuleData.length > 12 ? 8.5 : needsCompactChart ? 9 : 10;
const yAxisWidth = subModuleData.length > 12 ? 160 : needsCompactChart ? 140 : 150;

  // Master module specific Done color
  const doneColor = isMasterModule ? "#10b981" : "#22c55e";

  // ── Render
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "linear-gradient(135deg, #f0f4f8 0%, #d9e2ec 100%)",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    }}>
      {/* ── Header */}
      <div style={{
        background: "#1e40af",
        color: "white",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "16px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "700", margin: 0, letterSpacing: "0.5px" }}>
          FEC-Dev Status Dashboard
        </h1>
        {rawData.length > 0 && (
          <div style={{ fontSize: "0.85rem", color: "#bfdbfe" }}>
            Total Tasks: {rawData.length} &nbsp;|&nbsp; Modules: {MODULES.length}
          </div>
        )}
      </div>

      <div style={{ width: "1400px", maxWidth: "100%", margin: "0 auto", flex: 1, padding: "1rem" }}>

        {/* ── Admin Upload Panel - Strictly only when ?admin=true */}
        {isAdmin && (
          <div style={{
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: "1.2rem",
            marginBottom: "1.5rem",
          }}>
            <h2 style={{
              fontSize: "1.4rem", fontWeight: "600",
              color: "#2d3748", marginBottom: "1rem",
              marginTop: 0, textAlign: "center",
            }}>
              Upload Excel File
            </h2>

            <div style={{ marginBottom: "0.4rem" }}>
              <label style={{ display: "block", marginBottom: "0.4rem", fontWeight: "500", color: "#4a5568" }}>
                Select .xlsx file — must contain a sheet named <strong>"Consolidated Master"</strong> with columns:
                Module (Level 1), Sub-Module (Level 2), Task, Description / Notes, Status
              </label>
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileUpload}
                disabled={isProcessing}
                style={{
                  width: "100%",
                  padding: "0.6rem",
                  border: "2px dashed #cbd5e0",
                  borderRadius: "8px",
                  background: "#f7fafc",
                  cursor: isProcessing ? "not-allowed" : "pointer",
                }}
              />
            </div>

            {isProcessing && (
              <p style={{ color: "#3b82f6", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                Processing file...
              </p>
            )}
            {uploadError && (
              <p style={{ color: "#ef4444", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                ⚠ {uploadError}
              </p>
            )}
            {uploadSuccess && (
              <p style={{ color: "#22c55e", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                ✓ {uploadSuccess}
              </p>
            )}
            {rawData.length > 0 && (
  <button
    onClick={downloadSessionData}
    style={{
      marginTop: "0.8rem",
      padding: "0.6rem 1.2rem",
      background: "#22c55e",
      color: "white",
      border: "none",
      borderRadius: "8px",
      fontSize: "0.9rem",
      fontWeight: "600",
      cursor: "pointer",
    }}
  >
    ⬇ Download latest-report.json
  </button>
)}
          </div>
        )}

        {/* ── No data yet */}
        {rawData.length === 0 ? (
          <div style={{
            background: "white", borderRadius: "16px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            padding: "3.5rem 2rem", textAlign: "center", color: "#718096",
          }}>
            <h2 style={{ color: "#2d3748", marginBottom: "1rem" }}>Dashboard not available yet</h2>
            <p style={{ fontSize: "1.1rem" }}>
              No data has been loaded.<br />
              {isAdmin
                ? "Please upload an Excel file above to populate the dashboard."
                : "Please check back later once data has been loaded."}
            </p>
            {!isAdmin && (
              <p style={{ marginTop: "1.5rem", fontSize: "0.95rem", color: "#a0aec0" }}>
                (Admins: add <strong>?admin=true</strong> to the URL to upload files)
              </p>
            )}
          </div>
        ) : (
          <>
            {/* ── Module Selector */}
            <div style={{
              background: "white", borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              padding: "1.2rem", marginBottom: "1.5rem",
            }}>
              <h3 style={{ fontSize: "1.2rem", fontWeight: "600", color: "#2d3748", marginBottom: "0.8rem", marginTop: 0 }}>
                Select Module to View
              </h3>
              <select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setSearchText("");
                  setStatusFilter("");
                }}
                style={{
                  width: "100%", maxWidth: "400px",
                  padding: "0.7rem 1rem",
                  border: "1px solid #cbd5e0", borderRadius: "10px",
                  fontSize: "0.95rem", background: "#f7fafc",
                }}
              >
                <option value="">-- Choose a Module --</option>
                {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {/* ── Module Detail View */}
            {selectedModule ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>

                {/* KPI Cards */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: "1.5rem",
                }}>
                  <h3 style={{ margin: "0 0 1rem", color: "#2d3748", fontSize: "1.1rem" }}>
                    {selectedModule} — Overview
                  </h3>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                    <KPICard label="Sub-Modules" value={stats.subModules} color="#8b5cf6" bg="#faf5ff" />
                    <KPICard label="Total Tasks" value={stats.total} color="#3b82f6" bg="#eff6ff" />
                    <KPICard label="Done" value={stats.done} color="#22c55e" bg="#f0fdf4" />
                    <KPICard label="Pending" value={stats.pending} color="#f59e0b" bg="#fffbeb" />
                    <KPICard label="Awaiting Requirement" value={stats.awaiting} color="#ef4444" bg="#fef2f2" />
                  </div>
                </div>

                {/* Charts */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: "1.5rem",
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2rem" }}>
                    <div>
                      <h4 style={{ margin: "0 0 1rem", color: "#4a5568" }}>Status</h4>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={statusChartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          >
                            {statusChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div>
                      <h4 style={{ margin: "0 0 1rem", color: "#4a5568" }}>
                        {isMasterModule ? "Number of tasks by submodule" : "Number of tasks by submodule"}
                      </h4>
                      <ResponsiveContainer width="100%" height={chartHeight}>
                        
                        {useVerticalChart ? (
                          /* Vertical chart for Master module with different Done color */
<BarChart data={subModuleData} margin={{ top: 20, right: 30, left: 50, bottom: 210 }}>
                        <XAxis 
                              dataKey="name" 
                               tick={{ fontSize: 10, angle: -65, textAnchor: "end" }}
  height={180}
  interval={0}
                              label={{ 
                                value: "Submodule Name", 
                                position: "bottom", 
                                offset: 0,
                                style: { fontSize: 12, fontWeight: 500, fill: "#475569" }
                              }}
                            />
                            <YAxis 
                              tick={{ fontSize: 11 }}
                              label={{ 
                                value: "Number of Tasks", 
                                angle: -90, 
                                position: "insideLeft", 
                                offset: 15,
    style: { fontSize: 12, fontWeight: 500, fill: "#475569", textAnchor: "middle" }
                              }}
                            />
                            <Tooltip />
                          <Bar dataKey="DONE" name="Done" barSize={barThickness}>
  {subModuleData.map((entry, index) => {
    const color = MASTER_BAR_COLORS[index % MASTER_BAR_COLORS.length];
    return <Cell key={`done-${index}`} fill={color} />;
  })}
</Bar>

<Bar dataKey="PENDING" name="Pending" barSize={barThickness}>
  {subModuleData.map((entry, index) => {
    const color = MASTER_BAR_COLORS[index % MASTER_BAR_COLORS.length];
    return <Cell key={`pending-${index}`} fill={color} />;
  })}
</Bar>

<Bar dataKey="AWAITING REQUIREMENT FROM CLIENT" name="Awaiting" barSize={barThickness}>
  {subModuleData.map((entry, index) => {
    const color = MASTER_BAR_COLORS[index % MASTER_BAR_COLORS.length];
    return <Cell key={`awaiting-${index}`} fill={color} />;
  })}
</Bar>
                          </BarChart>
                        ) : (
                          /* Original horizontal stacked chart */
                          <BarChart 
                            data={subModuleData} 
                            layout="vertical" 
margin={{ left: 0, right: 20, top: 10, bottom: 40 }}
                    >
                            <XAxis 
                              type="number" 
                              tick={{ fontSize: 11 }} 
                              label={{ 
                                value: "Number of Tasks", 
                                position: "insideBottom", 
                                offset: -20,
                                style: { fontSize: 12, fontWeight: 500, fill: "#475569" }
                              }}
                            />
                          <YAxis 
  type="category" 
  dataKey="name" 
  tick={{ fontSize: yTickSize }}
  width={yAxisWidth}
  tickFormatter={(value) => value.length > 22 ? value.substring(0, 20) + "…" : value}
  label={{ 
    value: "Submodule Name", 
    angle: -90, 
    position: "insideLeft", 
    offset: -15,
    style: { fontSize: 12, fontWeight: 500, fill: "#475569", textAnchor: "middle" }
  }}
/>
                            <Tooltip />
                            <Bar dataKey="DONE" stackId="a" fill="#22c55e" name="Done" barSize={barThickness} />
                            <Bar dataKey="PENDING" stackId="a" fill="#f59e0b" name="Pending" barSize={barThickness} />
                            <Bar dataKey="AWAITING REQUIREMENT FROM CLIENT" stackId="a" fill="#ef4444" name="Awaiting" barSize={barThickness} />
                          </BarChart>
                        )}

                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: "1.5rem",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap", gap: "0.75rem", marginBottom: "1rem",
                  }}>
                    <h4 style={{ margin: 0, color: "#2d3748" }}>
                      Task Details ({filteredRows.length})
                    </h4>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <input
                        placeholder="Search task / sub-module..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        style={{
                          padding: "0.5rem 0.8rem",
                          border: "1px solid #cbd5e0",
                          borderRadius: "8px",
                          fontSize: "0.88rem",
                          width: "220px",
                        }}
                      />
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                          padding: "0.5rem 0.8rem",
                          border: "1px solid #cbd5e0",
                          borderRadius: "8px",
                          fontSize: "0.88rem",
                        }}
                      >
                        <option value="">All Statuses</option>
                        <option value="DONE">Done</option>
                        <option value="PENDING">Pending</option>
                        <option value="AWAITING REQUIREMENT FROM CLIENT">Awaiting Requirement</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.87rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                          {["#", "Module (Level 1)", "Sub-Module (Level 2)", "Task", "Description / Notes", "Status"].map((h) => (
                            <th key={h} style={{
                              padding: "10px 12px", textAlign: "left",
                              fontWeight: "600", color: "#4a5568", whiteSpace: "nowrap",
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ textAlign: "center", padding: "2rem", color: "#94a3b8" }}>
                              No tasks found.
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((row, i) => (
                            <tr
                              key={i}
                              style={{
                                borderBottom: "1px solid #f1f5f9",
                                background: i % 2 === 0 ? "white" : "#fafafa",
                              }}
                            >
                              <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{i + 1}</td>
                              <td style={{ padding: "8px 12px", fontWeight: "600", color: "#1e40af" }}>{row.module}</td>
                              <td style={{ padding: "8px 12px", color: "#374151" }}>{row.subModule}</td>
                              <td style={{ padding: "8px 12px", color: "#1f2937", maxWidth: "220px" }}>{row.task}</td>
                              <td style={{ padding: "8px 12px", color: "#6b7280", maxWidth: "280px", fontSize: "0.82rem" }}>
                                {(row.description || "").slice(0, 120)}
                                {row.description && row.description.length > 120 ? "…" : ""}
                              </td>
                              <td style={{ padding: "8px 12px" }}>
                                <StatusBadge status={row.status} />
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

            ) : (
              /* ── Overview (no module selected) - Consolidated Dashboard */
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>

                {/* Overall bar chart */}
                <div style={{
                  background: "white", borderRadius: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)", padding: "1.5rem",
                }}>
                  <h3 style={{ margin: "0 0 1rem", color: "#2d3748" }}>All Modules — Task Summary</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={overallModuleData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="done" fill="#22c55e" name="Done" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending" fill="#f59e0b" name="Not Done" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Module cards with colored % complete */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "1rem",
                }}>
                  {overallModuleData.map((m, i) => {
                    const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
                    return (
                      <div
                        key={m.name}
                        onClick={() => setSelectedModule(m.name)}
                        style={{
                          background: "white", borderRadius: "14px",
                          boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                          padding: "1.2rem", cursor: "pointer",
                          borderLeft: `4px solid ${m.color}`,
                          transition: "transform 0.15s, box-shadow 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "";
                          e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.06)";
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                          <span style={{ fontWeight: "700", fontSize: "1rem", color: m.color }}>{m.name}</span>
                          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>{m.total} tasks</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.8rem", background: "#f0fdf4", color: "#22c55e", padding: "2px 8px", borderRadius: "6px" }}>
                            ✓ {m.done} Done
                          </span>
                          {m.pending > 0 && (
                            <span style={{ fontSize: "0.8rem", background: "#fffbeb", color: "#f59e0b", padding: "2px 8px", borderRadius: "6px" }}>
                              ⚠ {m.pending} Not Done
                            </span>
                          )}
                        </div>
                        <div style={{ background: "#f1f5f9", borderRadius: "6px", height: "8px", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, background: m.color, height: "100%", borderRadius: "6px", transition: "width 0.4s" }} />
                        </div>
                        <div style={{ 
                          fontSize: "0.78rem", 
                          color: "#22c55e",
                          fontWeight: "600",
                          marginTop: "4px", 
                          textAlign: "right" 
                        }}>
                          {pct}% complete
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{
                  background: "white", borderRadius: "16px",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
                  padding: "2rem", textAlign: "center", color: "#718096",
                }}>
                  <p style={{ fontSize: "1.05rem" }}>
                    Select a module from the dropdown above or click any card to view its detailed dashboard.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <div style={{
          padding: "0.5rem 0",
          marginTop: "1.5rem",
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#4a5568",
          fontSize: "0.85rem",
        }}>
          FEC-Dev Status Dashboard
        </div>
      </div>

      {/* Scroll to top */}
      {showTopButton && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed", bottom: "10px", right: "10px",
            padding: "12px 16px", fontSize: "10px",
            borderRadius: "8%", border: "none",
            background: "#2563eb", color: "white",
            cursor: "pointer", boxShadow: "0 4px 10px rgba(0,0,0,0.3)", zIndex: 999,
          }}
        >
          ↑ Back to Top
        </button>
      )}
    </div>
  );
}