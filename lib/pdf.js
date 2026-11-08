import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const rs = (n) => 'Rs ' + Math.round(n || 0).toLocaleString('en-US');

export async function downloadOrSharePdf(doc, fileName, isShare = false) {
  try {
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (isShare && typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: fileName,
        text: `CarRent Monthly Report: ${fileName}`
      });
      return { ok: true, shared: true };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, cancelled: true };
    console.warn('Web Share failed, downloading instead:', err);
  }
  doc.save(fileName);
  return { ok: true, downloaded: true };
}

export function generateDriverPdf({ d, driverId, month }) {
  const driver = d.drivers.find((x) => x._id === driverId);
  if (!driver) throw new Error('Driver not found');

  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const t = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

  const mine = d.entries.filter((e) => e.driverId === driverId);
  const sum = {};
  const carUsed = {};
  mine.forEach((e) => {
    sum[e.date] = (sum[e.date] || 0) + (Number(e.earning) || 0);
    if (e.carId) {
      const c = d.cars.find((x) => x._id === e.carId);
      const name = c ? c.name : '';
      if (name) carUsed[e.date] = carUsed[e.date] ? `${carUsed[e.date]}, ${name}` : name;
    }
  });

  const first = mine.map((e) => e.date).sort()[0];
  const start = driver.joinDate || first || '9999';

  const cls = (dt) => {
    const a = sum[dt];
    if (a > 0) return 'ok';
    if (dt > t || dt < start) return 'na';
    return a === 0 ? 'zero' : 'no';
  };

  let totalReceived = 0;
  let daysPresent = 0;
  let daysAbsent = 0;
  const absentDates = [];
  const tableRows = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const dt = `${month}-${String(i).padStart(2, '0')}`;
    const dateObj = new Date(y, mo - 1, i);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const c = cls(dt);
    const cars = carUsed[dt] || '—';

    if (c === 'ok') {
      const amt = sum[dt] || 0;
      totalReceived += amt;
      daysPresent++;
      tableRows.push({
        date: dt,
        day: dayName,
        car: cars,
        amount: rs(amt),
        status: 'Present',
        type: 'ok'
      });
    } else if (c === 'zero') {
      daysAbsent++;
      absentDates.push(dt);
      tableRows.push({
        date: dt,
        day: dayName,
        car: cars,
        amount: 'Rs 0',
        status: 'Absent (Rs 0)',
        type: 'absent'
      });
    } else if (c === 'no') {
      daysAbsent++;
      absentDates.push(dt);
      tableRows.push({
        date: dt,
        day: dayName,
        car: '—',
        amount: '—',
        status: 'Absent',
        type: 'absent'
      });
    } else {
      tableRows.push({
        date: dt,
        day: dayName,
        car: '—',
        amount: '—',
        status: dt > t ? '—' : 'Before joining',
        type: 'na'
      });
    }
  }

  const avgPerDay = daysPresent > 0 ? Math.round(totalReceived / daysPresent) : 0;
  const dailyTarget = Number(driver.dailyRent) || 0;
  const targetTotal = dailyTarget > 0 ? dailyTarget * (daysPresent + daysAbsent) : 0;
  const targetDiff = totalReceived - targetTotal;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header Banner
  doc.setFillColor(10, 47, 61);
  doc.roundedRect(14, 12, 182, 22, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('CarRent', 20, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(18, 181, 166);
  doc.text('Rent-a-Car Record & Management', 20, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('MONTHLY DRIVER REPORT', 190, 21, { align: 'right' });

  const monthLabel = new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(215, 227, 234);
  doc.text(`${monthLabel}   |   Date: ${t}`, 190, 28, { align: 'right' });

  // Driver Details Card
  doc.setDrawColor(215, 227, 234);
  doc.setFillColor(244, 248, 250);
  doc.roundedRect(14, 38, 182, 24, 2, 2, 'FD');

  const carsSet = Array.from(new Set(Object.values(carUsed).flatMap((s) => s.split(', ')))).filter(Boolean).join(', ') || '—';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 47, 61);
  doc.text('Driver Name:', 18, 44);
  doc.text('Phone:', 82, 44);
  doc.text('CNIC:', 140, 44);

  doc.text('License No:', 18, 54);
  doc.text('Car(s) Used:', 82, 54);
  doc.text('Daily Target:', 140, 54);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 75, 85);
  doc.text(String(driver.name || '—'), 38, 44);
  doc.text(String(driver.phone || '—'), 94, 44);
  doc.text(String(driver.cnic || '—'), 151, 44);

  doc.text(String(driver.license || '—'), 37, 54);
  doc.text(carsSet.length > 24 ? carsSet.slice(0, 24) + '…' : carsSet, 102, 54);
  doc.text(dailyTarget > 0 ? `${rs(dailyTarget)} / day` : '—', 160, 54);

  // Summary Boxes
  const boxW = 34.5;
  const boxY = 66;
  const boxes = [
    { label: 'Total Received', val: rs(totalReceived), color: [15, 157, 106] },
    { label: 'Days Present', val: `${daysPresent} days`, color: [10, 47, 61] },
    { label: 'Days Absent', val: `${daysAbsent} days`, color: [198, 40, 40] },
    { label: 'Avg / Present Day', val: rs(avgPerDay), color: [10, 47, 61] },
    {
      label: dailyTarget > 0 ? 'Target vs Received' : 'Rent Status',
      val: dailyTarget > 0 ? `${targetDiff >= 0 ? '+' : ''}${rs(targetDiff)}` : 'Active',
      color: targetDiff < 0 ? [198, 40, 40] : [15, 157, 106]
    }
  ];

  boxes.forEach((b, idx) => {
    const bx = 14 + idx * (boxW + 2.3);
    doc.setDrawColor(215, 227, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, boxY, boxW, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(95, 118, 133);
    doc.text(b.label, bx + boxW / 2, boxY + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.val, bx + boxW / 2, boxY + 12, { align: 'center' });
  });

  // Day-by-Day Table
  autoTable(doc, {
    startY: 86,
    margin: { left: 14, right: 14 },
    head: [['Date', 'Day', 'Car Used', 'Amount Received', 'Status']],
    body: tableRows.map((r) => [r.date, r.day, r.car, r.amount, r.status]),
    foot: [['Total', '', '', rs(totalReceived), `${daysPresent} Present  ·  ${daysAbsent} Absent`]],
    theme: 'grid',
    headStyles: { fillColor: [10, 47, 61], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [240, 246, 249], textColor: [10, 47, 61], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica', lineColor: [215, 227, 234], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 16 },
      2: { cellWidth: 54 },
      3: { cellWidth: 42, halign: 'right' },
      4: { cellWidth: 44, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const row = tableRows[data.row.index];
        if (row?.type === 'absent') {
          data.cell.styles.fillColor = [255, 235, 238];
          data.cell.styles.textColor = [198, 40, 40];
          if (data.column.index === 4) data.cell.styles.fontStyle = 'bold';
        } else if (row?.type === 'na') {
          data.cell.styles.textColor = [150, 160, 170];
          data.cell.styles.fillColor = [250, 252, 253];
        } else if (row?.type === 'ok' && data.column.index === 4) {
          data.cell.styles.textColor = [15, 157, 106];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  let currentY = doc.lastAutoTable.finalY + 6;

  // Absent Dates Section
  if (currentY + 18 > 275) {
    doc.addPage();
    currentY = 20;
  }

  doc.setDrawColor(absentDates.length > 0 ? 246 : 215, absentDates.length > 0 ? 201 : 227, absentDates.length > 0 ? 203 : 234);
  doc.setFillColor(absentDates.length > 0 ? 255 : 244, absentDates.length > 0 ? 245 : 248, absentDates.length > 0 ? 245 : 250);
  doc.roundedRect(14, currentY, 182, 12, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  if (absentDates.length > 0) {
    doc.setTextColor(198, 40, 40);
    doc.text(`Absent Dates (${absentDates.length} days):`, 18, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    const absentListStr = absentDates.join(', ');
    doc.text(absentListStr.length > 95 ? absentListStr.slice(0, 95) + '…' : absentListStr, 18, currentY + 9.5);
  } else {
    doc.setTextColor(15, 157, 106);
    doc.text('Full Attendance:', 18, currentY + 5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(70, 70, 70);
    doc.text('No absent days recorded in this month. Complete attendance!', 18, currentY + 9.5);
  }
  currentY += 16;

  // Signatures
  if (currentY + 25 > 275) {
    doc.addPage();
    currentY = 25;
  }

  doc.setDrawColor(180, 195, 205);
  doc.setLineWidth(0.3);
  doc.line(24, currentY + 14, 82, currentY + 14);
  doc.line(128, currentY + 14, 186, currentY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(95, 118, 133);
  doc.text('Driver Signature', 53, currentY + 19, { align: 'center' });
  doc.text('Owner / Manager Signature', 157, currentY + 19, { align: 'center' });

  // Page Numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 140, 150);
    doc.text('CarRent Record System', 14, 291);
    doc.text(`Page ${p} of ${totalPages}`, 105, 291, { align: 'center' });
    doc.text('Monthly Driver Report', 196, 291, { align: 'right' });
  }

  return doc;
}

export function generateCarPdf({ d, carId, month }) {
  const car = d.cars.find((x) => x._id === carId);
  if (!car) throw new Error('Car not found');

  const drvName = (id) => d.drivers.find((x) => x._id === id)?.name || '—';
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const t = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

  const mine = d.entries.filter((e) => e.carId === carId);
  const sum = {};
  const drvMap = {};
  mine.forEach((e) => {
    sum[e.date] = (sum[e.date] || 0) + (Number(e.earning) || 0);
    if (e.driverId) {
      const name = drvName(e.driverId);
      if (name !== '—') drvMap[e.date] = drvMap[e.date] ? `${drvMap[e.date]}, ${name}` : name;
    }
  });

  const first = mine.map((e) => e.date).sort()[0];
  const start = car.startDate || car.purchaseDate || first || '9999';

  const cls = (dt) => {
    const a = sum[dt];
    if (a > 0) return 'ok';
    if (dt > t || dt < start) return 'na';
    return a === 0 ? 'zero' : 'no';
  };

  let totalEarning = 0;
  let daysWorked = 0;
  let daysAbsent = 0;
  const earningRows = [];

  for (let i = 1; i <= daysInMonth; i++) {
    const dt = `${month}-${String(i).padStart(2, '0')}`;
    const dateObj = new Date(y, mo - 1, i);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const c = cls(dt);
    const driverLabel = drvMap[dt] || (c === 'ok' ? drvName(car.driverId) : '—');

    if (c === 'ok') {
      const amt = sum[dt] || 0;
      totalEarning += amt;
      daysWorked++;
      earningRows.push({
        date: dt,
        day: dayName,
        driver: driverLabel,
        amount: rs(amt),
        status: 'Present',
        type: 'ok'
      });
    } else if (c === 'zero') {
      daysAbsent++;
      earningRows.push({
        date: dt,
        day: dayName,
        driver: driverLabel,
        amount: 'Rs 0',
        status: 'Absent (Rs 0)',
        type: 'absent'
      });
    } else if (c === 'no') {
      daysAbsent++;
      earningRows.push({
        date: dt,
        day: dayName,
        driver: '—',
        amount: '—',
        status: 'Absent',
        type: 'absent'
      });
    } else {
      earningRows.push({
        date: dt,
        day: dayName,
        driver: '—',
        amount: '—',
        status: dt > t ? '—' : 'Before start',
        type: 'na'
      });
    }
  }

  // Month Expenses for this car
  const mStart = `${month}-01`;
  const mEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`;
  const carExpenses = d.expenses
    .filter((e) => e.carId === carId && e.date >= mStart && e.date <= mEnd)
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  const totalExpense = carExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
  const netProfit = totalEarning - totalExpense;

  // Oil change history for this car
  const allOils = d.expenses
    .filter((e) => e.carId === carId && e.category === 'Oil change' && e.odometer != null)
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.odometer || 0) - (a.odometer || 0)));
  const latestOil = allOils[0];
  const prevOil = allOils[1];
  const kmRunOnLast = latestOil && prevOil ? Math.max(0, latestOil.odometer - prevOil.odometer) : null;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header Banner
  doc.setFillColor(10, 47, 61);
  doc.roundedRect(14, 12, 182, 22, 3, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('CarRent', 20, 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(18, 181, 166);
  doc.text('Rent-a-Car Record & Management', 20, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('MONTHLY CAR REPORT', 190, 21, { align: 'right' });

  const monthLabel = new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(215, 227, 234);
  doc.text(`${monthLabel}   |   Date: ${t}`, 190, 28, { align: 'right' });

  // Car Details Card
  doc.setDrawColor(215, 227, 234);
  doc.setFillColor(244, 248, 250);
  doc.roundedRect(14, 38, 182, 24, 2, 2, 'FD');

  const makeModelYear = [car.make, car.model, car.year].filter(Boolean).join(' ') || '—';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 47, 61);
  doc.text('Car Name:', 18, 44);
  doc.text('Number Plate:', 82, 44);
  doc.text('Current Driver:', 140, 44);

  doc.text('Make/Model:', 18, 54);
  doc.text('Car Cost:', 82, 54);
  doc.text('Start Date:', 140, 54);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 75, 85);
  doc.text(String(car.name || '—'), 35, 44);
  doc.text(String(car.number || '—'), 104, 44);
  doc.text(String(drvName(car.driverId)), 162, 44);

  doc.text(makeModelYear.length > 25 ? makeModelYear.slice(0, 25) + '…' : makeModelYear, 38, 54);
  doc.text(car.cost ? rs(car.cost) : '—', 98, 54);
  doc.text(String(car.startDate || car.purchaseDate || '—'), 157, 54);

  // Summary Boxes
  const boxW = 34.5;
  const boxY = 66;
  const boxes = [
    { label: 'Total Earning', val: rs(totalEarning), color: [15, 157, 106] },
    { label: 'Total Expense', val: rs(totalExpense), color: [198, 40, 40] },
    { label: 'Net Profit', val: rs(netProfit), color: netProfit >= 0 ? [15, 157, 106] : [198, 40, 40] },
    { label: 'Days Worked', val: `${daysWorked} days`, color: [10, 47, 61] },
    { label: 'Days Absent', val: `${daysAbsent} days`, color: daysAbsent > 0 ? [198, 40, 40] : [10, 47, 61] }
  ];

  boxes.forEach((b, idx) => {
    const bx = 14 + idx * (boxW + 2.3);
    doc.setDrawColor(215, 227, 234);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(bx, boxY, boxW, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(95, 118, 133);
    doc.text(b.label, bx + boxW / 2, boxY + 5.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(b.color[0], b.color[1], b.color[2]);
    doc.text(b.val, bx + boxW / 2, boxY + 12, { align: 'center' });
  });

  // Table 1: Day-by-Day Earning
  autoTable(doc, {
    startY: 86,
    margin: { left: 14, right: 14 },
    head: [['Date', 'Day', 'Driver', 'Earning', 'Status']],
    body: earningRows.map((r) => [r.date, r.day, r.driver, r.amount, r.status]),
    foot: [['Total Earning', '', '', rs(totalEarning), `${daysWorked} Worked  ·  ${daysAbsent} Absent`]],
    theme: 'grid',
    headStyles: { fillColor: [10, 47, 61], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [240, 246, 249], textColor: [10, 47, 61], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica', lineColor: [215, 227, 234], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 16 },
      2: { cellWidth: 54 },
      3: { cellWidth: 42, halign: 'right' },
      4: { cellWidth: 44, halign: 'center' }
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const row = earningRows[data.row.index];
        if (row?.type === 'absent') {
          data.cell.styles.fillColor = [255, 235, 238];
          data.cell.styles.textColor = [198, 40, 40];
          if (data.column.index === 4) data.cell.styles.fontStyle = 'bold';
        } else if (row?.type === 'na') {
          data.cell.styles.textColor = [150, 160, 170];
          data.cell.styles.fillColor = [250, 252, 253];
        } else if (row?.type === 'ok' && data.column.index === 4) {
          data.cell.styles.textColor = [15, 157, 106];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });

  let currentY = doc.lastAutoTable.finalY + 8;

  // Table 2: Month Expenses
  if (currentY + 25 > 275) {
    doc.addPage();
    currentY = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(10, 47, 61);
  doc.text(`Expenses in ${monthLabel}`, 14, currentY);
  currentY += 4;

  const expenseBody = carExpenses.length > 0
    ? carExpenses.map((e) => {
        const catStr = e.category === 'Oil change' && e.odometer != null
          ? `Oil change (${Number(e.odometer).toLocaleString('en-US')} km)`
          : e.category;
        return [e.date, catStr, rs(e.amount), e.note || '—'];
      })
    : [['—', 'No expenses recorded this month', 'Rs 0', '—']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [['Date', 'Category', 'Amount', 'Note']],
    body: expenseBody,
    foot: [['Total Expense', '', rs(totalExpense), '']],
    theme: 'grid',
    headStyles: { fillColor: [15, 107, 115], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    footStyles: { fillColor: [240, 246, 249], textColor: [198, 40, 40], fontStyle: 'bold', fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2, font: 'helvetica', lineColor: [215, 227, 234], lineWidth: 0.15 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 54 },
      2: { cellWidth: 38, halign: 'right' },
      3: { cellWidth: 64 }
    }
  });

  currentY = doc.lastAutoTable.finalY + 8;

  // Oil Change Status Card
  if (currentY + 30 > 275) {
    doc.addPage();
    currentY = 20;
  }

  doc.setDrawColor(215, 227, 234);
  doc.setFillColor(244, 248, 250);
  doc.roundedRect(14, currentY, 182, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(10, 47, 61);
  doc.text('Oil Change & Maintenance Status', 18, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 80, 90);
  if (latestOil) {
    const odoStr = `${Number(latestOil.odometer).toLocaleString('en-US')} km`;
    const runStr = kmRunOnLast != null ? `${kmRunOnLast.toLocaleString('en-US')} km` : 'First record';
    const dueStr = latestOil.nextDue ? `${Number(latestOil.nextDue).toLocaleString('en-US')} km` : '—';

    doc.text(`Last Oil Change: ${latestOil.date}   |   Reading: ${odoStr}`, 18, currentY + 12);
    doc.text(`Run on Previous Oil: ${runStr}   |   Next Due: ${dueStr}`, 18, currentY + 17);
  } else {
    doc.text('No oil change records recorded for this car yet.', 18, currentY + 14);
  }
  currentY += 26;

  // Signatures
  if (currentY + 25 > 275) {
    doc.addPage();
    currentY = 25;
  }

  doc.setDrawColor(180, 195, 205);
  doc.setLineWidth(0.3);
  doc.line(24, currentY + 14, 82, currentY + 14);
  doc.line(128, currentY + 14, 186, currentY + 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(95, 118, 133);
  doc.text('Owner / Manager Signature', 53, currentY + 19, { align: 'center' });
  doc.text('Driver / Receiver Signature', 157, currentY + 19, { align: 'center' });

  // Page Numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 140, 150);
    doc.text('CarRent Record System', 14, 291);
    doc.text(`Page ${p} of ${totalPages}`, 105, 291, { align: 'center' });
    doc.text('Monthly Car Report', 196, 291, { align: 'right' });
  }

  return doc;
}

