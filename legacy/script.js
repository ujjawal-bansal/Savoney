document.addEventListener("DOMContentLoaded", function () {

// INCOME CHART DATA SETUP
const incomeData = {
  labels: [],
  amounts: []
};

const ctx = document.getElementById("incomeChart").getContext("2d");

const incomeChart = new Chart(ctx, {
  type: "pie",
  data: {
    labels: incomeData.labels,
    datasets: [{
      label: "Income Sources",
      data: incomeData.amounts,
      backgroundColor: ["#4caf50", "#2196f3", "#ff9800", "#e91e63", "#9c27b0"]
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom"
      }
    }
  }
});


// Income Details

const addBtn = document.getElementById("btn-primary");
addBtn.addEventListener("click", function (e) {
  e.preventDefault();

  const incomeAmount = Number(document.getElementById("incomeamount").value);
  const incomeDate = document.getElementById("date").value;
  const incomeRemarks = document.getElementById("incomeremarks").value;
  const incomeSource = document.getElementById("incomesource").value;

  if (!incomeAmount || !incomeDate || !incomeSource) {
    alert("Please fill in all income fields!");
    return;
  }

  const incomeList = document.getElementById("income-list");

  incomeList.innerHTML = `
    <div class="income-line">
      ${incomeAmount} <span class="white-text"> from </span>
      ${incomeSource} <span class="white-text"> on </span>
      ${incomeDate} <span class="white-text"> as </span>
      ${incomeRemarks}
    </div>
  ` + incomeList.innerHTML;

  let currentBalance = Number(document.getElementById("totalbalance").innerHTML);
  let currentIncome = Number(document.getElementById("totalincome").innerHTML);

  document.getElementById("totalbalance").innerHTML = currentBalance + incomeAmount;
  document.getElementById("totalincome").innerHTML = currentIncome + incomeAmount;

  // Update Chart
  const sourceIndex = incomeData.labels.indexOf(incomeSource);
  if (sourceIndex !== -1) {
    incomeData.amounts[sourceIndex] += incomeAmount;
  } else {
    incomeData.labels.push(incomeSource);
    incomeData.amounts.push(incomeAmount);
  }

  incomeChart.update();
  document.getElementById("incomeform").reset();


});

// Budget Details
const NextBtn =document.getElementById("btn-budget")

NextBtn.addEventListener("click", function (e) {
    e.preventDefault(); // prevents form from reloading the page

    //const budgetAmount = document.getElementById("budgetamount").value;
    const budgetType = document.getElementById("budgettype").value;

    const budgetItems= document.getElementById("budgetitems");
    
  budgetItems.innerHTML = `
    <div class="budget-line">
       ${budgetType}<div class="separator"></div>
    </div>
  `+ budgetItems.innerHTML;


  let option = document.createElement("option")
  option.text=budgetItems.innerText;
  option.value=budgetItems.innerText;
  let select= document.getElementById("expensesource");
  select.appendChild(option); //passing the selected budget type to the expense type dropdown (expensesource)



})

 // EXPENSE CHART DATA SETUP
const expenseData = {
  labels: [],
  amounts: []
};

const expenseCtx = document.getElementById("expenseChart").getContext("2d");

const expenseChart = new Chart(expenseCtx, {
  type: "pie",
  data: {
    labels: expenseData.labels,
    datasets: [{
      label: "Expense Sources",
      data: expenseData.amounts,
      backgroundColor: ["#f44336", "#ff5722", "#795548", "#607d8b", "#009688"]
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: {
        position: "bottom"
      }
    }
  }
});  

// Expense Details 

const expBtn = document.getElementById("expBtn");


expBtn.addEventListener("click", function (e) {
    e.preventDefault(); // prevents form from reloading the page

    const expenseAmount = Number(document.getElementById("expenseamount").value);
    const expenseDate = document.getElementById("expdate").value;
    const expenseRemarks = document.getElementById("expenseremarks").value;
    const expenseSource = document.getElementById("expensesource").value
    

    const expenseList= document.getElementById("expenselist")
    
    expenseList.innerHTML = `
    <div class="income-line">
       ${expenseAmount}<span class="white-text"> from </span>
       ${expenseSource}<span class="white-text">on</span>
       ${expenseDate} <span class="white-text" > as</span> 
       ${expenseRemarks}
    </div>
  `+ expenseList.innerHTML; // most recent income entry at the top;
     document.getElementById("totalbalance").innerHTML = document.getElementById("totalbalance").innerHTML - expenseAmount;
     document.getElementById("totalexpense").innerHTML = Number(document.getElementById("totalexpense").innerHTML) + expenseAmount;
     document.querySelector("#expense form").reset();

// Update Expense Chart
const expenseSourceIndex = expenseData.labels.indexOf(expenseSource);
if (expenseSourceIndex !== -1) {
  expenseData.amounts[expenseSourceIndex] += expenseAmount;
} else {
  expenseData.labels.push(expenseSource);
  expenseData.amounts.push(expenseAmount);
}

expenseChart.update();



});

const rstBtn= document.getElementById("rstBtn");
rstBtn.addEventListener("click", function (e) {
  e.preventDefault();
  
  if (!confirm("Are you sure you want to reset all data? This cannot be undone.")) return;

  // Clear localStorage data
  localStorage.removeItem("savoneyData");

  // Reset balances to 0
  document.getElementById("totalbalance").innerText = 0;
  document.getElementById("totalincome").innerText = 0;
  document.getElementById("totalexpense").innerText = 0;

  // Clear history
  document.getElementById("income-list").innerHTML = "";
  document.getElementById("expenselist").innerHTML = "";
  document.getElementById("budgetitems").innerHTML = "";

  // Reset income and expense chart data
  incomeData.labels = [];
  incomeData.amounts = [];
  incomeChart.data.labels = [];
  incomeChart.data.datasets[0].data = [];
  incomeChart.update();

  expenseData.labels = [];
  expenseData.amounts = [];
  expenseChart.data.labels = [];
  expenseChart.data.datasets[0].data = [];
  expenseChart.update();
  
  // Optionally reload page, but not necessary since UI reset manually
  // location.reload();
});
})

